import { normalizeName } from "./resolver.js";

export function hasObservationForCard(observations, result, cardName) {
  const cardKey = normalizeName(cardName);
  if (!cardKey || !["Y", "N"].includes(result)) return false;

  return observations.some((observation) => (
    observation.result === result
    && (observation.cards || []).some((observedCard) => normalizeName(observedCard) === cardKey)
  ));
}
