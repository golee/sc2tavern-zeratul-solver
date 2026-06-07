export const CLOSE_VALUE_THRESHOLD = 200;

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function displayValue(value) {
  return String(value || "").trim();
}

export function parseDelimitedLine(line) {
  if (line.includes("\t")) {
    return line.split("\t").map((part) => part.trim());
  }

  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells;
}

function isHeaderRow(name) {
  const normalized = normalizeName(name);
  return ["card", "카드", "카드명", "name"].includes(normalized);
}

function parseEnabled(value) {
  const normalized = normalizeName(value);
  if (!normalized) return true;
  return !["n", "no", "false", "0", "x", "off", "비활성", "사용안함", "아니오"].includes(normalized);
}

function parseMemoNumber(memo, label) {
  const match = String(memo || "").match(new RegExp(`${label}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (!match) return NaN;
  return Number(match[1]);
}

function parseMemoText(memo, label) {
  const match = String(memo || "").match(new RegExp(`${label}\\s*:\\s*([^;]+)`));
  return match ? displayValue(match[1]) : "";
}

export function parseCardPool(text) {
  const seen = new Set();
  const cards = [];

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const cells = parseDelimitedLine(trimmed);
    const name = displayValue(cells[0]);
    if (!name || isHeaderRow(name)) return;

    const key = normalizeName(name);
    if (seen.has(key)) return;
    seen.add(key);
    const memo = displayValue(cells[4]);

    cards.push({
      name,
      key,
      race: displayValue(cells[1]),
      tier: displayValue(cells[2]),
      enabled: parseEnabled(cells[3]),
      memo,
      source: parseMemoText(memo, "출처"),
      number: parseMemoNumber(memo, "유닛"),
      value: parseMemoNumber(memo, "가치"),
    });
  });

  return cards;
}

function sameValue(left, right) {
  const leftValue = displayValue(left);
  const rightValue = displayValue(right);
  return leftValue && rightValue && normalizeName(leftValue) === normalizeName(rightValue);
}

function bothFinite(left, right) {
  return Number.isFinite(left) && Number.isFinite(right);
}

export function isCloseCard(picked, candidate) {
  if (!picked || !candidate) return false;
  if (picked.key === candidate.key) return true;
  if (sameValue(picked.race, candidate.race)) return true;
  if (bothFinite(picked.number, candidate.number) && picked.number === candidate.number) return true;
  return bothFinite(picked.value, candidate.value)
    && Math.abs(picked.value - candidate.value) <= CLOSE_VALUE_THRESHOLD;
}

export function getCleanCards(values) {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    const name = displayValue(value);
    const key = normalizeName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });

  return result;
}

export function normalizeStoredObservations(value, maxObservations = Infinity) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const result = item?.result;
      const cards = getCleanCards(Array.isArray(item?.cards) ? item.cards : []);
      if (!["Y", "N"].includes(result) || !cards.length) return null;

      return { result, cards };
    })
    .filter(Boolean)
    .slice(0, maxObservations)
    .map((observation, index) => ({
      id: index + 1,
      ...observation,
    }));
}

export function normalizeStoredCandidateKeys(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeName).filter(Boolean))];
}

function normalizeFailedCandidateKeys(value) {
  if (value instanceof Set) return value;
  return new Set(normalizeStoredCandidateKeys(value));
}

export function computeCandidates(cards, options = {}) {
  const observations = options.observations || [];
  const currentCards = options.currentCards || [];
  const failedCandidateKeys = normalizeFailedCandidateKeys(options.failedCandidateKeys || []);
  const cardByKey = new Map(cards.map((card) => [card.key, card]));
  const activeObservations = observations
    .filter((observation) => ["Y", "N"].includes(observation.result))
    .map((observation, index) => ({
      id: observation.id ?? index + 1,
      ...observation,
      pickedCards: observation.cards
        .map((cardName) => cardByKey.get(normalizeName(cardName)))
        .filter(Boolean),
    }));
  const liveSet = new Set(getCleanCards(currentCards).map(normalizeName));

  return cards.map((card) => {
    const contradictions = [];
    let positiveHits = 0;
    let negativeBlocks = 0;

    activeObservations.forEach((observation) => {
      const close = observation.pickedCards.some((picked) => isCloseCard(picked, card));
      if (observation.result === "Y") {
        if (close) {
          positiveHits += 1;
        } else {
          contradictions.push(`#${observation.id} Y`);
        }
      }

      if (observation.result === "N") {
        if (close) {
          contradictions.push(`#${observation.id} N`);
        } else {
          negativeBlocks += 1;
        }
      }
    });

    const manuallyFailed = failedCandidateKeys.has(card.key);
    const possible = card.enabled && contradictions.length === 0;
    const seenNow = liveSet.has(card.key);
    const action = manuallyFailed
      ? "예언 실패"
      : !possible
        ? "제외"
        : seenNow
          ? "현재 보이면 우선 확인"
          : "후보 유지";

    return {
      ...card,
      possible,
      manuallyFailed,
      seenNow,
      contradictions: contradictions.length,
      contradictionRefs: contradictions,
      positiveHits,
      negativeBlocks,
      action,
    };
  });
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("ko-KR") : "-";
}

function getUniqueFiniteValues(values) {
  return [...new Set(values.filter(Number.isFinite))]
    .sort((left, right) => left - right);
}

export function formatDiscreteValues(values) {
  const uniqueValues = getUniqueFiniteValues(values);
  if (!uniqueValues.length) return "-";
  return uniqueValues.map(formatNumber).join(", ");
}

export function formatIntegerSegments(values) {
  const uniqueValues = getUniqueFiniteValues(values);
  if (!uniqueValues.length) return "-";

  const segments = [];
  let start = uniqueValues[0];
  let end = uniqueValues[0];

  uniqueValues.slice(1).forEach((value) => {
    if (Number.isInteger(value) && Number.isInteger(end) && value === end + 1) {
      end = value;
      return;
    }

    segments.push([start, end]);
    start = value;
    end = value;
  });
  segments.push([start, end]);

  return segments
    .map(([segmentStart, segmentEnd]) => (
      segmentStart === segmentEnd
        ? formatNumber(segmentStart)
        : `${formatNumber(segmentStart)}~${formatNumber(segmentEnd)}`
    ))
    .join(", ");
}

export function getConditionSummary(candidates) {
  const possible = candidates.filter((candidate) => candidate.possible);
  const races = [...new Set(possible.map((candidate) => candidate.race).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));

  return {
    races,
    raceText: races.length ? races.join(", ") : "-",
    valueRangeText: formatDiscreteValues(possible.map((candidate) => candidate.value)),
    unitRangeText: formatIntegerSegments(possible.map((candidate) => candidate.number)),
  };
}
