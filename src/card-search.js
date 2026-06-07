import { normalizeName } from "./resolver.js";

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

export function createCardSearch({ disassemble, getChoseong, getCards }) {
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
    return getCards()
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

  function findCard(value) {
    const key = normalizeName(value);
    if (!key) return null;
    return getCards().find((item) => item.key === key) || null;
  }

  return {
    findCard,
    getCardSuggestions,
  };
}
