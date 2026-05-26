"use strict";

const MAX_OBSERVATION_CARDS = 10;
const MAX_OBSERVATIONS = 30;

const defaultPoolText = (typeof window.ZERATUL_DEFAULT_CARD_POOL === "string" && window.ZERATUL_DEFAULT_CARD_POOL.trim())
  ? window.ZERATUL_DEFAULT_CARD_POOL.trim()
  : "카드명\t종족/타입\t티어\t사용 여부\t메모";

const state = {
  cards: [],
  observations: [],
  currentCards: Array(MAX_OBSERVATION_CARDS).fill(""),
  selectedResult: "Y",
  filter: "possible",
  search: "",
};

const el = {
  poolTableBody: document.getElementById("poolTableBody"),
  observationInputs: document.getElementById("observationInputs"),
  liveInputs: document.getElementById("liveInputs"),
  observationBody: document.getElementById("observationBody"),
  liveBody: document.getElementById("liveBody"),
  candidateBody: document.getElementById("candidateBody"),
  candidateSearch: document.getElementById("candidateSearch"),
  candidateFilter: document.getElementById("candidateFilter"),
  cardOptions: document.getElementById("cardOptions"),
  metricCardPool: document.getElementById("metricCardPool"),
  metricObservations: document.getElementById("metricObservations"),
  metricPossible: document.getElementById("metricPossible"),
  metricSeen: document.getElementById("metricSeen"),
  toast: document.getElementById("toast"),
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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

    cards.push({
      name,
      key,
      race: displayValue(cells[1]),
      tier: displayValue(cells[2]),
      enabled: parseEnabled(cells[3]),
      memo: displayValue(cells[4]),
    });
  });

  return cards;
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

function computeCandidates() {
  const activeObservations = state.observations
    .filter((observation) => ["Y", "N"].includes(observation.result))
    .map((observation) => ({
      ...observation,
      cardSet: new Set(observation.cards.map(normalizeName)),
    }));
  const liveSet = new Set(getCleanCards(state.currentCards).map(normalizeName));

  return state.cards.map((card) => {
    const contradictions = [];
    let positiveHits = 0;
    let negativeBlocks = 0;

    activeObservations.forEach((observation) => {
      const contains = observation.cardSet.has(card.key);
      if (observation.result === "Y") {
        if (contains) {
          positiveHits += 1;
        } else {
          contradictions.push(`#${observation.id} Y`);
        }
      }

      if (observation.result === "N") {
        if (contains) {
          contradictions.push(`#${observation.id} N`);
        } else {
          negativeBlocks += 1;
        }
      }
    });

    const possible = card.enabled && contradictions.length === 0;
    const seenNow = liveSet.has(card.key);
    const action = !possible ? "제외" : seenNow ? "현재 보이면 우선 확인" : "후보 유지";

    return {
      ...card,
      possible,
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

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    el.toast.classList.remove("show");
  }, 2200);
}

function renderDatalist() {
  const options = state.cards.map((card) => {
    const option = document.createElement("option");
    option.value = card.name;
    return option;
  });
  el.cardOptions.replaceChildren(...options);
}

function renderInputGrid(container, prefix, values) {
  if (!container.childElementCount) {
    const inputs = Array.from({ length: MAX_OBSERVATION_CARDS }, (_, index) => {
      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.setAttribute("list", "cardOptions");
      input.placeholder = `카드 ${index + 1}`;
      input.dataset.index = String(index);
      input.id = `${prefix}${index + 1}`;
      return input;
    });
    container.replaceChildren(...inputs);
  }

  [...container.querySelectorAll("input")].forEach((input, index) => {
    input.value = values[index] || "";
  });
}

function readInputs(container) {
  return [...container.querySelectorAll("input")].map((input) => input.value);
}

function setObservationEditor(result, cards) {
  state.selectedResult = result;
  document.querySelectorAll(".segment").forEach((button) => {
    const active = button.dataset.result === result;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderInputGrid(el.observationInputs, "observationCard", [
    ...cards,
    ...Array(MAX_OBSERVATION_CARDS).fill(""),
  ].slice(0, MAX_OBSERVATION_CARDS));
}

function renderCardPoolTable() {
  if (!state.cards.length) {
    setEmptyRow(el.poolTableBody, 5, "카드풀이 비어 있습니다.");
    return;
  }

  const rows = state.cards.map((card) => {
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
    resultCell.append(makeTag(observation.result, observation.result === "Y" ? "yes" : "neutral"));
    tr.append(resultCell);

    const cardsCell = document.createElement("td");
    const pills = document.createElement("div");
    pills.className = "pill-row";
    observation.cards.forEach((card) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = card;
      pills.append(pill);
    });
    cardsCell.append(pills);
    tr.append(cardsCell);

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.dataset.action = "edit-observation";
    editButton.dataset.id = String(observation.id);
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.className = "danger";
    deleteButton.dataset.action = "delete-observation";
    deleteButton.dataset.id = String(observation.id);
    actions.append(editButton, deleteButton);
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
      makeCell(candidate.possible ? "정답 후보. 우선 확인/구매 후보" : "현재 정보상 제외")
    );
    return tr;
  });

  el.liveBody.replaceChildren(...rows);
}

function sortedCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.possible !== b.possible) return a.possible ? -1 : 1;
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
    tr.append(seenCell, makeCell(candidate.action));
    return tr;
  });

  el.candidateBody.replaceChildren(...rows);
}

function renderMetrics(candidates) {
  const possible = candidates.filter((candidate) => candidate.possible);
  const seenPossible = possible.filter((candidate) => candidate.seenNow);
  el.metricCardPool.textContent = String(state.cards.length);
  el.metricObservations.textContent = String(state.observations.length);
  el.metricPossible.textContent = String(possible.length);
  el.metricSeen.textContent = String(seenPossible.length);
}

function renderAll() {
  state.cards = parseCardPool(defaultPoolText);
  const candidates = computeCandidates();

  el.candidateFilter.value = state.filter;
  el.candidateSearch.value = state.search;
  renderDatalist();
  renderInputGrid(el.observationInputs, "observationCard", readInputs(el.observationInputs));
  renderInputGrid(el.liveInputs, "liveCard", state.currentCards);
  renderCardPoolTable();
  renderObservations();
  renderLive(candidates);
  renderCandidates(candidates);
  renderMetrics(candidates);
}

function addObservation() {
  if (state.observations.length >= MAX_OBSERVATIONS) {
    showToast(`관측은 최대 ${MAX_OBSERVATIONS}개까지 유지합니다.`);
    return;
  }

  const cards = getCleanCards(readInputs(el.observationInputs));
  if (!cards.length) {
    showToast("관측 카드가 비어 있습니다.");
    return;
  }

  const nextId = state.observations.reduce((max, observation) => Math.max(max, observation.id), 0) + 1;
  state.observations.push({
    id: nextId,
    result: state.selectedResult,
    cards,
  });
  setObservationEditor(state.selectedResult, []);
  renderAll();
}

function clearObservationEditor() {
  setObservationEditor(state.selectedResult, []);
}

function updateLiveFromInputs() {
  state.currentCards = readInputs(el.liveInputs);
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
  document.getElementById("addObservationBtn").addEventListener("click", addObservation);
  document.getElementById("clearObservationsBtn").addEventListener("click", () => {
    if (!window.confirm("관측값을 모두 지울까요?")) return;
    state.observations = [];
    renderAll();
  });
  document.getElementById("clearLiveBtn").addEventListener("click", () => {
    state.currentCards = Array(MAX_OBSERVATION_CARDS).fill("");
    renderAll();
  });
  document.getElementById("copyCandidatesBtn").addEventListener("click", copyCandidates);

  el.liveInputs.addEventListener("input", updateLiveFromInputs);
  el.observationInputs.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      addObservation();
    }
    if (event.key === "Escape") {
      clearObservationEditor();
    }
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      setObservationEditor(button.dataset.result, readInputs(el.observationInputs));
    });
  });

  el.observationBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const observation = state.observations.find((item) => item.id === id);
    if (!observation) return;

    if (button.dataset.action === "edit-observation") {
      setObservationEditor(observation.result, observation.cards);
      state.observations = state.observations.filter((item) => item.id !== id);
      renderAll();
    }

    if (button.dataset.action === "delete-observation") {
      state.observations = state.observations.filter((item) => item.id !== id);
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

bindEvents();
setObservationEditor(state.selectedResult, []);
renderAll();
