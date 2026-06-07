import {
  normalizeStoredCandidateKeys,
  normalizeStoredObservations,
} from "./resolver.js";

export function loadSessionObservations(storageKey, maxObservations) {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) return [];
    return normalizeStoredObservations(JSON.parse(stored), maxObservations);
  } catch {
    return [];
  }
}

export function saveSessionObservations(storageKey, observations) {
  try {
    if (!observations.length) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify(observations.map(({ id, result, cards }) => ({ id, result, cards })))
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function loadSessionFailedCandidates(storageKey) {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) return new Set();
    return new Set(normalizeStoredCandidateKeys(JSON.parse(stored)));
  } catch {
    return new Set();
  }
}

export function saveSessionFailedCandidates(storageKey, failedCandidateKeys) {
  try {
    const keys = [...failedCandidateKeys];
    if (!keys.length) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}
