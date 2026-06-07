"use strict";

const { disassemble, getChoseong } = window.EsHangul;
const MAX_OBSERVATION_CARDS = 10;
const MAX_OBSERVATIONS = 30;
const CLOSE_VALUE_THRESHOLD = 200;
const OBSERVATIONS_STORAGE_KEY = "zeratulResolver.observations.v1";
const FAILED_CANDIDATES_STORAGE_KEY = "zeratulResolver.failedCandidates.v1";
const BASE_POOL_FILTERS = [
  { type: "all", value: "전체", label: "전체" },
  { type: "race", value: "프로토스", label: "프로토스" },
  { type: "race", value: "테란", label: "테란" },
  { type: "race", value: "저그", label: "저그" },
  { type: "race", value: "중립", label: "중립" },
];

const defaultPoolText = (typeof window.ZERATUL_DEFAULT_CARD_POOL === "string" && window.ZERATUL_DEFAULT_CARD_POOL.trim())
  ? window.ZERATUL_DEFAULT_CARD_POOL.trim()
  : "카드명\t종족/타입\t티어\t사용 여부\t메모";

const state = {
  cards: [],
  observations: [],
  currentCards: Array(MAX_OBSERVATION_CARDS).fill(""),
  failedCandidateKeys: new Set(),
  poolFilter: { type: "all", value: "전체" },
  filter: "possible",
  search: "",
};

let suppressNextComboClick = false;

const el = {
  poolTabs: document.getElementById("poolTabs"),
  poolTableBody: document.getElementById("poolTableBody"),
  positiveObservationSelect: document.getElementById("positiveObservationSelect"),
  negativeObservationSelect: document.getElementById("negativeObservationSelect"),
  liveInputs: document.getElementById("liveInputs"),
  observationBody: document.getElementById("observationBody"),
  liveBody: document.getElementById("liveBody"),
  candidateBody: document.getElementById("candidateBody"),
  candidateSearch: document.getElementById("candidateSearch"),
  candidateFilter: document.getElementById("candidateFilter"),
  observationCount: document.getElementById("observationCount"),
  candidateCount: document.getElementById("candidateCount"),
  conditionRaces: document.getElementById("conditionRaces"),
  conditionValueRange: document.getElementById("conditionValueRange"),
  conditionUnitRange: document.getElementById("conditionUnitRange"),
  toast: document.getElementById("toast"),
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function displayValue(value) {
  return String(value || "").trim();
}

function parseDelimitedLine(line) {
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

function parseCardPool(text) {
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

function isCloseCard(picked, candidate) {
  if (!picked || !candidate) return false;
  if (picked.key === candidate.key) return true;
  if (sameValue(picked.race, candidate.race)) return true;
  if (bothFinite(picked.number, candidate.number) && picked.number === candidate.number) return true;
  return bothFinite(picked.value, candidate.value)
    && Math.abs(picked.value - candidate.value) <= CLOSE_VALUE_THRESHOLD;
}

function getCleanCards(values) {
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

function normalizeStoredObservations(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const result = item?.result;
      const cards = getCleanCards(Array.isArray(item?.cards) ? item.cards : []);
      if (!["Y", "N"].includes(result) || !cards.length) return null;

      return { result, cards };
    })
    .filter(Boolean)
    .slice(0, MAX_OBSERVATIONS)
    .map((observation, index) => ({
      id: index + 1,
      ...observation,
    }));
}

function loadSessionObservations() {
  try {
    const stored = window.sessionStorage.getItem(OBSERVATIONS_STORAGE_KEY);
    if (!stored) return;
    state.observations = normalizeStoredObservations(JSON.parse(stored));
  } catch {
    state.observations = [];
  }
}

function saveSessionObservations() {
  try {
    if (!state.observations.length) {
      window.sessionStorage.removeItem(OBSERVATIONS_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      OBSERVATIONS_STORAGE_KEY,
      JSON.stringify(state.observations.map(({ id, result, cards }) => ({ id, result, cards })))
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function normalizeStoredCandidateKeys(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeName).filter(Boolean))];
}

function loadSessionFailedCandidates() {
  try {
    const stored = window.sessionStorage.getItem(FAILED_CANDIDATES_STORAGE_KEY);
    if (!stored) return;
    state.failedCandidateKeys = new Set(normalizeStoredCandidateKeys(JSON.parse(stored)));
  } catch {
    state.failedCandidateKeys = new Set();
  }
}

function saveSessionFailedCandidates() {
  try {
    const keys = [...state.failedCandidateKeys];
    if (!keys.length) {
      window.sessionStorage.removeItem(FAILED_CANDIDATES_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(FAILED_CANDIDATES_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function computeCandidates() {
  const cardByKey = new Map(state.cards.map((card) => [card.key, card]));
  const activeObservations = state.observations
    .filter((observation) => ["Y", "N"].includes(observation.result))
    .map((observation) => ({
      ...observation,
      pickedCards: observation.cards
        .map((cardName) => cardByKey.get(normalizeName(cardName)))
        .filter(Boolean),
    }));
  const liveSet = new Set(getCleanCards(state.currentCards).map(normalizeName));

  return state.cards.map((card) => {
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

    const manuallyFailed = state.failedCandidateKeys.has(card.key);
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

function makeCell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function makeTag(text, type) {
  const span = document.createElement("span");
  span.className = `tag ${type}`;
  span.textContent = text;
  return span;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("ko-KR") : "-";
}

function getUniqueFiniteValues(values) {
  return [...new Set(values.filter(Number.isFinite))]
    .sort((left, right) => left - right);
}

function formatDiscreteValues(values) {
  const uniqueValues = getUniqueFiniteValues(values);
  if (!uniqueValues.length) return "-";
  return uniqueValues.map(formatNumber).join(", ");
}

function formatIntegerSegments(values) {
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

function setConditionText(element, text) {
  element.textContent = text;
  element.title = text === "-" ? "" : text;
}

function setEmptyRow(tbody, colSpan, message) {
  tbody.replaceChildren();
  const tr = document.createElement("tr");
  tr.className = "empty-row";
  const td = document.createElement("td");
  td.colSpan = colSpan;
  td.textContent = message;
  tr.append(td);
  tbody.append(tr);
}

function resultLabel(result) {
  return result;
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    el.toast.classList.remove("show");
  }, 2200);
}

function renderInputGrid(container, prefix, values) {
  if (!container.childElementCount) {
    const controls = Array.from({ length: MAX_OBSERVATION_CARDS }, (_, index) => {
      const combobox = document.createElement("div");
      combobox.className = "card-combobox";
      combobox.dataset.comboMode = "live";

      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = `카드 ${index + 1}`;
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
      input.dataset.index = String(index);
      input.id = `${prefix}${index + 1}`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "combo-toggle";
      toggle.tabIndex = -1;
      toggle.setAttribute("aria-label", "카드 목록 열기");
      toggle.textContent = "▾";

      const menu = document.createElement("div");
      menu.className = "combo-menu";
      menu.setAttribute("role", "listbox");

      combobox.append(input, toggle, menu);
      return combobox;
    });
    container.replaceChildren(...controls);
  }

  [...container.querySelectorAll("input")].forEach((input, index) => {
    input.value = values[index] || "";
  });
}

function readInputs(container) {
  return [...container.querySelectorAll("input")].map((input) => input.value);
}

function findCard(value) {
  const key = normalizeName(value);
  if (!key) return null;
  return state.cards.find((item) => item.key === key) || null;
}

function getSearchTokens(value) {
  const compact = compactSearchText(value);
  if (!compact) {
    return { compact: "", disassembled: "", choseong: "" };
  }

  return {
    compact,
    disassembled: disassemble(compact),
    choseong: getChoseong(compact),
  };
}

function getCardSearchTokens(card) {
  if (!card.searchTokens) {
    card.searchTokens = getSearchTokens(card.name);
  }
  return card.searchTokens;
}

function getSuggestionScore(card, queryTokens) {
  if (!queryTokens.compact) return 3;

  const cardTokens = getCardSearchTokens(card);
  if (cardTokens.compact === queryTokens.compact) return 0;
  if (cardTokens.compact.startsWith(queryTokens.compact)) return 1;
  if (cardTokens.disassembled.startsWith(queryTokens.disassembled)) return 2;
  if (cardTokens.choseong.startsWith(queryTokens.choseong)) return 3;
  if (cardTokens.compact.includes(queryTokens.compact)) return 4;
  if (cardTokens.disassembled.includes(queryTokens.disassembled)) return 5;
  if (cardTokens.choseong.includes(queryTokens.choseong)) return 6;
  return null;
}

function getCardSuggestions(value) {
  const queryTokens = getSearchTokens(value);
  return state.cards
    .map((card, index) => {
      const score = getSuggestionScore(card, queryTokens);
      if (score == null) return null;
      return { card, index, score };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      if (left.card.enabled !== right.card.enabled) return left.card.enabled ? -1 : 1;
      return left.index - right.index;
    })
    .map((item) => item.card);
}

function getCombobox(input) {
  return input ? input.closest(".card-combobox") : null;
}

function closestFromEvent(event, selector) {
  return event.target instanceof Element ? event.target.closest(selector) : null;
}

function getComboInputFromEvent(event) {
  return closestFromEvent(event, "input");
}

function getComboMenu(input) {
  return getCombobox(input)?.querySelector(".combo-menu") || null;
}

function getComboOptions(input) {
  return [...(getComboMenu(input)?.querySelectorAll(".combo-option") || [])];
}

function setComboActive(input, nextIndex) {
  const combobox = getCombobox(input);
  const options = getComboOptions(input);
  if (!combobox || !options.length) return;

  const maxIndex = options.length - 1;
  const index = Math.max(0, Math.min(nextIndex, maxIndex));
  combobox.dataset.activeIndex = String(index);
  options.forEach((option, optionIndex) => {
    option.setAttribute("aria-selected", String(optionIndex === index));
  });
  options[index].scrollIntoView({ block: "nearest" });
}

function closeCombobox(input) {
  const combobox = getCombobox(input);
  if (!combobox) return;
  combobox.classList.remove("open");
  combobox.dataset.activeIndex = "-1";
  const menu = combobox.querySelector(".combo-menu");
  if (menu) menu.replaceChildren();
  const textInput = combobox.querySelector("input");
  if (textInput) textInput.setAttribute("aria-expanded", "false");
}

function closeOtherComboboxes(currentInput) {
  document.querySelectorAll(".card-combobox.open").forEach((combobox) => {
    if (combobox !== getCombobox(currentInput)) {
      closeCombobox(combobox.querySelector("input"));
    }
  });
}

function renderCombobox(input) {
  const combobox = getCombobox(input);
  const menu = getComboMenu(input);
  if (!combobox || !menu) return;

  closeOtherComboboxes(input);
  const cards = getCardSuggestions(input.value);
  const options = cards.map((card, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "combo-option";
    option.dataset.cardName = card.name;
    option.dataset.index = String(index);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");

    const name = document.createElement("strong");
    name.textContent = card.name;
    const meta = document.createElement("small");
    meta.textContent = [card.race, card.tier ? `${card.tier}티어` : "", card.source]
      .filter(Boolean)
      .join(" · ");
    option.append(name, meta);
    return option;
  });

  menu.replaceChildren(...options);
  combobox.classList.toggle("open", options.length > 0);
  combobox.dataset.activeIndex = "-1";
  input.setAttribute("aria-expanded", String(options.length > 0));
}

function syncLiveInputs() {
  state.currentCards = readInputs(el.liveInputs);
}

function focusComboInput(input, options = {}) {
  const combobox = getCombobox(input);
  if (options.suppressMenu && combobox) {
    combobox.dataset.suppressNextFocus = "true";
    window.setTimeout(() => {
      if (combobox.dataset.suppressNextFocus === "true") {
        delete combobox.dataset.suppressNextFocus;
      }
    }, 0);
  }

  input.focus();

  if (options.suppressMenu) {
    window.requestAnimationFrame(() => closeCombobox(input));
  }
}

function chooseComboCard(input, cardName) {
  const combobox = getCombobox(input);
  const mode = combobox?.dataset.comboMode;
  const result = combobox?.dataset.result;
  input.value = cardName;
  closeCombobox(input);

  if (mode === "observation") {
    addObservation(result, cardName);
    input.value = "";
    focusComboInput(input, { suppressMenu: true });
    return;
  }

  syncLiveInputs();
  renderAll();
  focusComboInput(input, { suppressMenu: true });
}

function handleComboInput(event) {
  const input = getComboInputFromEvent(event);
  if (!input || !getCombobox(input)) return;

  const combobox = getCombobox(input);
  const mode = combobox.dataset.comboMode;
  const exactCard = findCard(input.value);

  if (mode === "observation" && exactCard && !event.isComposing) {
    chooseComboCard(input, exactCard.name);
    return;
  }

  if (mode === "live") {
    syncLiveInputs();
    renderAll();
  }

  renderCombobox(input);
}

function handleComboFocus(event) {
  const input = getComboInputFromEvent(event);
  const combobox = getCombobox(input);
  if (!input || !combobox) return;
  if (combobox.dataset.suppressNextFocus === "true") {
    delete combobox.dataset.suppressNextFocus;
    return;
  }
  renderCombobox(input);
}

function handleComboKeydown(event) {
  const input = getComboInputFromEvent(event);
  if (!input || !getCombobox(input)) return;

  const combobox = getCombobox(input);
  const open = combobox.classList.contains("open");
  const options = getComboOptions(input);
  const currentIndex = Number(combobox.dataset.activeIndex || -1);

  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!open) renderCombobox(input);
    setComboActive(input, currentIndex < 0 ? 0 : currentIndex + 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!open) renderCombobox(input);
    setComboActive(input, currentIndex < 0 ? options.length - 1 : currentIndex - 1);
    return;
  }

  if (event.key === "Enter") {
    const activeOption = options[currentIndex];
    const exactCard = findCard(input.value);
    if (activeOption || exactCard) {
      event.preventDefault();
      chooseComboCard(input, activeOption?.dataset.cardName || exactCard.name);
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeCombobox(input);
    if (combobox.dataset.comboMode === "observation") input.value = "";
  }
}

function handleComboCompositionEnd(event) {
  const input = getComboInputFromEvent(event);
  if (!input || !getCombobox(input)) return;

  window.requestAnimationFrame(() => {
    handleComboInput({ target: input, isComposing: false });
  });
}

function handleComboPointerDown(event) {
  const option = closestFromEvent(event, ".combo-option");
  if (!option) return;

  event.preventDefault();
  suppressNextComboClick = true;
  window.setTimeout(() => {
    suppressNextComboClick = false;
  }, 250);
  const input = option.closest(".card-combobox")?.querySelector("input");
  if (input) chooseComboCard(input, option.dataset.cardName);
}

function handleComboClick(event) {
  if (suppressNextComboClick) {
    suppressNextComboClick = false;
    event.preventDefault();
    document.querySelectorAll(".card-combobox.open input").forEach(closeCombobox);
    return true;
  }

  const option = closestFromEvent(event, ".combo-option");
  if (option) {
    const input = option.closest(".card-combobox")?.querySelector("input");
    if (input) chooseComboCard(input, option.dataset.cardName);
    return true;
  }

  const toggle = closestFromEvent(event, ".combo-toggle");
  if (toggle) {
    const input = toggle.closest(".card-combobox")?.querySelector("input");
    if (!input) return false;
    if (getCombobox(input).classList.contains("open")) {
      closeCombobox(input);
    } else {
      input.focus();
      renderCombobox(input);
    }
    return true;
  }

  return false;
}

function handleComboPointerMove(event) {
  const option = closestFromEvent(event, ".combo-option");
  if (!option) return;
  const input = option.closest(".card-combobox")?.querySelector("input");
  if (input) setComboActive(input, Number(option.dataset.index));
}

function getPoolFilters() {
  const expansionSources = [...new Set(state.cards
    .map((card) => card.source)
    .filter((source) => source && source !== "핵심"))]
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((source) => ({ type: "source", value: source, label: source }));

  return [...BASE_POOL_FILTERS, ...expansionSources];
}

function isActivePoolFilter(filter) {
  return state.poolFilter.type === filter.type && state.poolFilter.value === filter.value;
}

function matchesPoolFilter(card) {
  if (state.poolFilter.type === "all") return true;
  if (state.poolFilter.type === "race") return card.race === state.poolFilter.value;
  if (state.poolFilter.type === "source") return card.source === state.poolFilter.value;
  return true;
}

function renderPoolTabs() {
  const tabs = getPoolFilters().map((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pool-tab";
    button.textContent = filter.label;
    button.dataset.filterType = filter.type;
    button.dataset.filterValue = filter.value;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(isActivePoolFilter(filter)));
    button.setAttribute("aria-pressed", String(isActivePoolFilter(filter)));
    return button;
  });

  el.poolTabs.replaceChildren(...tabs);
}

function renderCardPoolTable() {
  if (!state.cards.length) {
    setEmptyRow(el.poolTableBody, 5, "카드풀이 비어 있습니다.");
    return;
  }

  const filteredCards = state.cards.filter(matchesPoolFilter);
  if (!filteredCards.length) {
    setEmptyRow(el.poolTableBody, 5, "표시할 카드가 없습니다.");
    return;
  }

  const rows = filteredCards.map((card) => {
    const tr = document.createElement("tr");
    tr.append(
      makeCell(card.name),
      makeCell(card.enabled ? "Y" : "N"),
      makeCell(card.race || "-"),
      makeCell(card.tier || "-"),
      makeCell(card.memo || "-")
    );
    return tr;
  });
  el.poolTableBody.replaceChildren(...rows);
}

function renderObservations() {
  if (!state.observations.length) {
    setEmptyRow(el.observationBody, 4, "관측값이 없습니다.");
    return;
  }

  const rows = state.observations.map((observation) => {
    const tr = document.createElement("tr");
    tr.append(makeCell(String(observation.id)));

    const resultCell = document.createElement("td");
    resultCell.className = `observation-result ${observation.result === "Y" ? "positive" : "negative"}`;
    resultCell.textContent = resultLabel(observation.result);
    tr.append(resultCell);

    const cardsCell = document.createElement("td");
    cardsCell.className = "observation-card-cell";
    cardsCell.textContent = observation.cards.join(", ");
    tr.append(cardsCell);

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.className = "danger";
    deleteButton.dataset.action = "delete-observation";
    deleteButton.dataset.id = String(observation.id);
    actions.append(deleteButton);
    actionCell.append(actions);
    tr.append(actionCell);

    return tr;
  });

  el.observationBody.replaceChildren(...rows);
}

function renderLive(candidates) {
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const currentCards = getCleanCards(state.currentCards);

  if (!currentCards.length) {
    setEmptyRow(el.liveBody, 5, "현재 보이는 카드가 없습니다.");
    return;
  }

  const rows = currentCards.map((cardName, index) => {
    const key = normalizeName(cardName);
    const candidate = candidateByKey.get(key);
    const tr = document.createElement("tr");
    tr.append(makeCell(String(index + 1)), makeCell(cardName));

    const possibleCell = document.createElement("td");
    if (!candidate) {
      possibleCell.append(makeTag("NO", "no"));
      tr.append(possibleCell, makeCell("카드풀 없음"), makeCell("카드풀 없음"));
      return tr;
    }

    possibleCell.append(makeTag(candidate.possible ? "YES" : "NO", candidate.possible ? "yes" : "no"));
    tr.append(
      possibleCell,
      makeCell(String(candidate.contradictions)),
      makeCell(candidate.manuallyFailed
        ? "예언 실패 표시됨"
        : candidate.possible
          ? "정답 후보. 우선 확인/구매 후보"
          : "현재 정보상 제외")
    );
    return tr;
  });

  el.liveBody.replaceChildren(...rows);
}

function sortedCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.possible !== b.possible) return a.possible ? -1 : 1;
    if (a.manuallyFailed !== b.manuallyFailed) return a.manuallyFailed ? 1 : -1;
    if (a.seenNow !== b.seenNow) return a.seenNow ? -1 : 1;
    if (a.contradictions !== b.contradictions) return a.contradictions - b.contradictions;
    if (a.positiveHits !== b.positiveHits) return b.positiveHits - a.positiveHits;
    if (a.negativeBlocks !== b.negativeBlocks) return b.negativeBlocks - a.negativeBlocks;
    return a.name.localeCompare(b.name, "ko");
  });
}

function renderCandidates(candidates) {
  const query = normalizeName(state.search);
  const filtered = sortedCandidates(candidates).filter((candidate) => {
    if (query && !normalizeName(candidate.name).includes(query)) return false;
    if (state.filter === "possible") return candidate.possible;
    if (state.filter === "seen") return candidate.seenNow;
    if (state.filter === "excluded") return !candidate.possible;
    return true;
  });

  if (!filtered.length) {
    setEmptyRow(el.candidateBody, 7, "표시할 후보가 없습니다.");
    return;
  }

  const rows = filtered.map((candidate) => {
    const tr = document.createElement("tr");
    tr.append(makeCell(candidate.name));

    const possibleCell = document.createElement("td");
    possibleCell.append(makeTag(candidate.possible ? "YES" : "NO", candidate.possible ? "yes" : "no"));
    tr.append(possibleCell);

    tr.append(
      makeCell(String(candidate.contradictions)),
      makeCell(String(candidate.positiveHits)),
      makeCell(String(candidate.negativeBlocks))
    );

    const seenCell = document.createElement("td");
    seenCell.append(makeTag(candidate.seenNow ? "YES" : "-", candidate.seenNow ? "yes" : "neutral"));
    tr.append(seenCell);

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    if (candidate.manuallyFailed) {
      const label = document.createElement("span");
      label.className = "candidate-action-label";
      label.textContent = "예언 실패";
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.textContent = "복구";
      restoreButton.dataset.action = "restore-candidate";
      restoreButton.dataset.cardKey = candidate.key;
      actions.append(label, restoreButton);
    } else if (candidate.possible) {
      const failButton = document.createElement("button");
      failButton.type = "button";
      failButton.textContent = "실패";
      failButton.className = "danger";
      failButton.dataset.action = "fail-candidate";
      failButton.dataset.cardKey = candidate.key;
      actions.append(failButton);
    } else {
      actions.textContent = candidate.action;
    }

    actionCell.append(actions);
    tr.append(actionCell);
    return tr;
  });

  el.candidateBody.replaceChildren(...rows);
}

function renderSectionCounts(candidates) {
  const possible = candidates.filter((candidate) => candidate.possible);
  el.observationCount.textContent = String(state.observations.length);
  el.candidateCount.textContent = String(possible.length);
}

function renderConditionSummary(candidates) {
  const possible = candidates.filter((candidate) => candidate.possible);
  const races = [...new Set(possible.map((candidate) => candidate.race).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));

  setConditionText(el.conditionRaces, races.length ? races.join(", ") : "-");
  setConditionText(el.conditionValueRange, formatDiscreteValues(possible.map((candidate) => candidate.value)));
  setConditionText(el.conditionUnitRange, formatIntegerSegments(possible.map((candidate) => candidate.number)));
}

function renderAll() {
  state.cards = parseCardPool(defaultPoolText);
  const candidates = computeCandidates();

  el.candidateFilter.value = state.filter;
  el.candidateSearch.value = state.search;
  renderInputGrid(el.liveInputs, "liveCard", state.currentCards);
  renderPoolTabs();
  renderCardPoolTable();
  renderObservations();
  renderLive(candidates);
  renderCandidates(candidates);
  renderSectionCounts(candidates);
  renderConditionSummary(candidates);
}

function addObservation(result, cardName) {
  if (state.observations.length >= MAX_OBSERVATIONS) {
    showToast(`관측은 최대 ${MAX_OBSERVATIONS}개까지 유지합니다.`);
    return;
  }

  const cards = getCleanCards([cardName]);
  if (!cards.length) {
    showToast("관측 카드가 비어 있습니다.");
    return;
  }

  const nextId = state.observations.reduce((max, observation) => Math.max(max, observation.id), 0) + 1;
  state.observations.push({
    id: nextId,
    result,
    cards,
  });
  saveSessionObservations();
  renderAll();
}

function copyCandidates() {
  const names = computeCandidates()
    .filter((candidate) => candidate.possible)
    .map((candidate) => candidate.name)
    .join("\n");

  if (!names) {
    showToast("복사할 후보가 없습니다.");
    return;
  }

  navigator.clipboard.writeText(names)
    .then(() => showToast("가능 후보를 클립보드에 복사했습니다."))
    .catch(() => showToast("클립보드 복사에 실패했습니다."));
}

function bindEvents() {
  document.addEventListener("input", handleComboInput);
  document.addEventListener("change", handleComboInput);
  document.addEventListener("focusin", handleComboFocus);
  document.addEventListener("compositionend", handleComboCompositionEnd);
  document.addEventListener("keydown", handleComboKeydown);
  document.addEventListener("pointerdown", handleComboPointerDown);
  document.addEventListener("click", (event) => {
    const handledComboClick = handleComboClick(event);
    if (!handledComboClick && !closestFromEvent(event, ".card-combobox")) {
      document.querySelectorAll(".card-combobox.open input").forEach(closeCombobox);
    }
  });
  document.addEventListener("pointermove", handleComboPointerMove);

  document.getElementById("clearObservationsBtn").addEventListener("click", () => {
    if (!window.confirm("관측값을 모두 지울까요?")) return;
    state.observations = [];
    saveSessionObservations();
    renderAll();
  });
  document.getElementById("clearLiveBtn").addEventListener("click", () => {
    state.currentCards = Array(MAX_OBSERVATION_CARDS).fill("");
    renderAll();
  });
  document.getElementById("copyCandidatesBtn").addEventListener("click", copyCandidates);

  el.poolTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".pool-tab");
    if (!button) return;

    state.poolFilter = {
      type: button.dataset.filterType,
      value: button.dataset.filterValue,
    };
    renderAll();
  });

  el.observationBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const observation = state.observations.find((item) => item.id === id);
    if (!observation) return;

    if (button.dataset.action === "delete-observation") {
      state.observations = state.observations.filter((item) => item.id !== id);
      saveSessionObservations();
      renderAll();
    }
  });

  el.candidateBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    if (button.dataset.action === "fail-candidate") {
      state.failedCandidateKeys.add(normalizeName(button.dataset.cardKey));
      saveSessionFailedCandidates();
      showToast("예언 실패로 표시했습니다.");
      renderAll();
      return;
    }

    if (button.dataset.action === "restore-candidate") {
      state.failedCandidateKeys.delete(normalizeName(button.dataset.cardKey));
      saveSessionFailedCandidates();
      showToast("예언 실패 표시를 해제했습니다.");
      renderAll();
    }
  });

  el.candidateFilter.addEventListener("change", () => {
    state.filter = el.candidateFilter.value;
    renderAll();
  });
  el.candidateSearch.addEventListener("input", () => {
    state.search = el.candidateSearch.value;
    renderAll();
  });
}

loadSessionObservations();
loadSessionFailedCandidates();
bindEvents();
renderAll();
