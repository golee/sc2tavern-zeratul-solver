import {
  formatDiscreteValues,
  formatIntegerSegments,
  getCleanCards,
  normalizeName,
} from "./resolver.js";
import {
  makeCell,
  makeTag,
  setConditionText,
  setEmptyRow,
} from "./app-dom.js";

function resultLabel(result) {
  return result;
}

function getPoolFilters(cards, basePoolFilters) {
  const expansionSources = [...new Set(cards
    .map((card) => card.source)
    .filter((source) => source && source !== "핵심"))]
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((source) => ({ type: "source", value: source, label: source }));

  return [...basePoolFilters, ...expansionSources];
}

function isActivePoolFilter(state, filter) {
  return state.poolFilter.type === filter.type && state.poolFilter.value === filter.value;
}

function matchesPoolFilter(state, card) {
  if (state.poolFilter.type === "all") return true;
  if (state.poolFilter.type === "race") return card.race === state.poolFilter.value;
  if (state.poolFilter.type === "source") return card.source === state.poolFilter.value;
  return true;
}

export function renderPoolTabs({ el, state, basePoolFilters }) {
  const tabs = getPoolFilters(state.cards, basePoolFilters).map((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pool-tab";
    button.textContent = filter.label;
    button.dataset.filterType = filter.type;
    button.dataset.filterValue = filter.value;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(isActivePoolFilter(state, filter)));
    button.setAttribute("aria-pressed", String(isActivePoolFilter(state, filter)));
    return button;
  });

  el.poolTabs.replaceChildren(...tabs);
}

export function renderCardPoolTable({ el, state }) {
  if (!state.cards.length) {
    setEmptyRow(el.poolTableBody, 5, "카드풀이 비어 있습니다.");
    return;
  }

  const filteredCards = state.cards.filter((card) => matchesPoolFilter(state, card));
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

export function renderObservations({ el, state }) {
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

export function renderLive({ el, state }) {
  const currentCards = getCleanCards(state.currentCards);

  if (!currentCards.length) {
    setEmptyRow(el.liveBody, 4, "현재 턴 카드가 없습니다.");
    return;
  }

  const makeObservationActionCell = (cardName) => {
    const td = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    ["Y", "N"].forEach((result) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${result} 기록`;
      button.dataset.action = "record-live-observation";
      button.dataset.result = result;
      button.dataset.cardName = cardName;
      if (result === "N") button.className = "danger";
      actions.append(button);
    });

    td.append(actions);
    return td;
  };

  const rows = currentCards.map((cardName, index) => {
    const tr = document.createElement("tr");
    tr.append(makeCell(String(index + 1)), makeCell(cardName), makeObservationActionCell(cardName));

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.className = "danger";
    deleteButton.dataset.action = "delete-live-card";
    deleteButton.dataset.index = String(index);
    actions.append(deleteButton);
    actionCell.append(actions);
    tr.append(actionCell);
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

export function renderCandidates({ el, state, candidates }) {
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

export function renderSectionCounts({ el, state, candidates }) {
  const possible = candidates.filter((candidate) => candidate.possible);
  el.observationCount.textContent = String(state.observations.length);
  el.candidateCount.textContent = String(possible.length);
}

export function renderConditionSummary({ el, candidates }) {
  const possible = candidates.filter((candidate) => candidate.possible);
  const races = [...new Set(possible.map((candidate) => candidate.race).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));

  setConditionText(el.conditionRaces, races.length ? races.join(", ") : "-");
  setConditionText(el.conditionValueRange, formatDiscreteValues(possible.map((candidate) => candidate.value)));
  setConditionText(el.conditionUnitRange, formatIntegerSegments(possible.map((candidate) => candidate.number)));
}
