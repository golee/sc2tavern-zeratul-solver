import { ZERATUL_DEFAULT_CARD_POOL } from "./cardpool-data.js";
import { closestFromEvent, createToast } from "./src/app-dom.js";
import { createCardSearch } from "./src/card-search.js";
import {
  closeOpenComboboxes,
  createComboboxController,
  readInputs,
  renderInputGrid,
} from "./src/combobox.js";
import {
  computeCandidates as computeCandidatesCore,
  getCleanCards,
  normalizeName,
  parseCardPool,
} from "./src/resolver.js";
import {
  renderCandidates,
  renderCardPoolTable,
  renderConditionSummary,
  renderLive,
  renderObservations,
  renderPoolTabs,
  renderSectionCounts,
} from "./src/renderers.js";
import {
  loadSessionFailedCandidates,
  loadSessionObservations,
  saveSessionFailedCandidates,
  saveSessionObservations,
} from "./src/session-storage.js";
import { disassemble, getChoseong } from "./vendor/es-hangul.browser.js";

const MAX_OBSERVATION_CARDS = 10;
const MAX_OBSERVATIONS = 30;
const OBSERVATIONS_STORAGE_KEY = "zeratulResolver.observations.v1";
const FAILED_CANDIDATES_STORAGE_KEY = "zeratulResolver.failedCandidates.v1";
const DEFAULT_POOL_FILTER = { type: "all", value: "전체" };
const BASE_POOL_FILTERS = [
  { ...DEFAULT_POOL_FILTER, label: "전체" },
  { type: "race", value: "프로토스", label: "프로토스" },
  { type: "race", value: "테란", label: "테란" },
  { type: "race", value: "저그", label: "저그" },
  { type: "race", value: "중립", label: "중립" },
];

const defaultPoolText = (typeof ZERATUL_DEFAULT_CARD_POOL === "string" && ZERATUL_DEFAULT_CARD_POOL.trim())
  ? ZERATUL_DEFAULT_CARD_POOL.trim()
  : "카드명\t종족/타입\t티어\t사용 여부\t메모";

const state = {
  cards: [],
  observations: [],
  currentCards: Array(MAX_OBSERVATION_CARDS).fill(""),
  failedCandidateKeys: new Set(),
  poolFilter: { ...DEFAULT_POOL_FILTER },
  filter: "possible",
  search: "",
};

const el = {
  poolTabs: document.getElementById("poolTabs"),
  poolTableBody: document.getElementById("poolTableBody"),
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

const showToast = createToast(el.toast);
const cardSearch = createCardSearch({
  disassemble,
  getChoseong,
  getCards: () => state.cards,
});

function computeCandidates() {
  return computeCandidatesCore(state.cards, {
    observations: state.observations,
    currentCards: state.currentCards,
    failedCandidateKeys: state.failedCandidateKeys,
  });
}

function persistObservations() {
  saveSessionObservations(OBSERVATIONS_STORAGE_KEY, state.observations);
}

function persistFailedCandidates() {
  saveSessionFailedCandidates(FAILED_CANDIDATES_STORAGE_KEY, state.failedCandidateKeys);
}

function syncLiveInputs() {
  state.currentCards = readInputs(el.liveInputs);
}

function renderAll() {
  state.cards = parseCardPool(defaultPoolText);
  const candidates = computeCandidates();

  el.candidateFilter.value = state.filter;
  el.candidateSearch.value = state.search;
  renderInputGrid(el.liveInputs, "liveCard", state.currentCards, MAX_OBSERVATION_CARDS);
  renderPoolTabs({ el, state, basePoolFilters: BASE_POOL_FILTERS });
  renderCardPoolTable({ el, state });
  renderObservations({ el, state });
  renderLive({ el, state, candidates });
  renderCandidates({ el, state, candidates });
  renderSectionCounts({ el, state, candidates });
  renderConditionSummary({ el, candidates });
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
  persistObservations();
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

function clearObservationDraftInputs() {
  document.querySelectorAll('[data-combo-mode="observation"] input').forEach((input) => {
    input.value = "";
  });
}

function resetAll() {
  if (!window.confirm("모든 관측값, 현재 카드, 예언 실패 표시, 검색/필터를 초기화할까요?")) return;

  state.observations = [];
  state.currentCards = Array(MAX_OBSERVATION_CARDS).fill("");
  state.failedCandidateKeys = new Set();
  state.poolFilter = { ...DEFAULT_POOL_FILTER };
  state.filter = "possible";
  state.search = "";

  persistObservations();
  persistFailedCandidates();
  clearObservationDraftInputs();
  closeOpenComboboxes();
  renderAll();
  showToast("전체 초기화했습니다.");
}

const combobox = createComboboxController({
  addObservation,
  findCard: cardSearch.findCard,
  getCardSuggestions: cardSearch.getCardSuggestions,
  renderAll,
  syncLiveInputs,
});

function bindComboboxEvents() {
  document.addEventListener("input", combobox.handleInput);
  document.addEventListener("change", combobox.handleInput);
  document.addEventListener("focusin", combobox.handleFocus);
  document.addEventListener("compositionend", combobox.handleCompositionEnd);
  document.addEventListener("keydown", combobox.handleKeydown);
  document.addEventListener("pointerdown", combobox.handlePointerDown);
  document.addEventListener("click", (event) => {
    const handledComboClick = combobox.handleClick(event);
    if (!handledComboClick && !closestFromEvent(event, ".card-combobox")) {
      closeOpenComboboxes();
    }
  });
  document.addEventListener("pointermove", combobox.handlePointerMove);
}

function bindToolbarEvents() {
  document.getElementById("resetAllBtn").addEventListener("click", resetAll);

  document.getElementById("clearObservationsBtn").addEventListener("click", () => {
    if (!window.confirm("관측값을 모두 지울까요?")) return;
    state.observations = [];
    persistObservations();
    renderAll();
  });

  document.getElementById("clearLiveBtn").addEventListener("click", () => {
    state.currentCards = Array(MAX_OBSERVATION_CARDS).fill("");
    renderAll();
  });

  document.getElementById("copyCandidatesBtn").addEventListener("click", copyCandidates);
}

function bindPoolEvents() {
  el.poolTabs.addEventListener("click", (event) => {
    const button = closestFromEvent(event, ".pool-tab");
    if (!button) return;

    state.poolFilter = {
      type: button.dataset.filterType,
      value: button.dataset.filterValue,
    };
    renderAll();
  });
}

function bindObservationEvents() {
  el.observationBody.addEventListener("click", (event) => {
    const button = closestFromEvent(event, "button[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const observation = state.observations.find((item) => item.id === id);
    if (!observation) return;

    if (button.dataset.action === "delete-observation") {
      state.observations = state.observations.filter((item) => item.id !== id);
      persistObservations();
      renderAll();
    }
  });
}

function bindCandidateEvents() {
  el.candidateBody.addEventListener("click", (event) => {
    const button = closestFromEvent(event, "button[data-action]");
    if (!button) return;

    if (button.dataset.action === "fail-candidate") {
      state.failedCandidateKeys.add(normalizeName(button.dataset.cardKey));
      persistFailedCandidates();
      showToast("예언 실패로 표시했습니다.");
      renderAll();
      return;
    }

    if (button.dataset.action === "restore-candidate") {
      state.failedCandidateKeys.delete(normalizeName(button.dataset.cardKey));
      persistFailedCandidates();
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

function bindEvents() {
  bindComboboxEvents();
  bindToolbarEvents();
  bindPoolEvents();
  bindObservationEvents();
  bindCandidateEvents();
}

state.observations = loadSessionObservations(OBSERVATIONS_STORAGE_KEY, MAX_OBSERVATIONS);
state.failedCandidateKeys = loadSessionFailedCandidates(FAILED_CANDIDATES_STORAGE_KEY);
bindEvents();
renderAll();
document.documentElement.classList.remove("app-loading");
