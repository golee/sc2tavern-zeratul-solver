import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  computeCandidates,
  getConditionSummary,
  parseCardPool,
} from "../src/resolver.js";

const propertyPoolText = `
카드명	종족/타입	티어	사용 여부	메모
지원군 소환	프로토스	1	Y	출처:테스트; 유닛:1; 가치:100
바퀴 부대	저그	1	Y	출처:테스트; 유닛:2; 가치:500
지뢰밭	테란	3	Y	출처:테스트; 유닛:1; 가치:900
황금 함대	프로토스	5	Y	출처:테스트; 유닛:7; 가치:2000
용병 군단	테란	5	Y	출처:테스트; 유닛:4; 가치:2100
비활성 카드	중립	6	N	출처:테스트; 유닛:1; 가치:100
`;

const cards = parseCardPool(propertyPoolText);
const cardNames = cards.map((card) => card.name);
const enabledKeys = new Set(cards.filter((card) => card.enabled).map((card) => card.key));

const observationArb = fc.record({
  result: fc.constantFrom("Y", "N"),
  cards: fc.array(fc.constantFrom(...cardNames), { minLength: 1, maxLength: 2 }),
});

const observationsArb = fc.array(observationArb, { minLength: 0, maxLength: 8 });

function possibleKeys(candidates) {
  return candidates
    .filter((candidate) => candidate.possible)
    .map((candidate) => candidate.key)
    .sort();
}

describe("resolver property behavior", () => {
  test("observation order does not change possible candidates", () => {
    fc.assert(fc.property(observationsArb, (observations) => {
      const normal = possibleKeys(computeCandidates(cards, { observations }));
      const reversed = possibleKeys(computeCandidates(cards, { observations: [...observations].reverse() }));

      expect(reversed).toEqual(normal);
    }));
  });

  test("adding an observation never increases possible candidates", () => {
    fc.assert(fc.property(observationsArb, observationArb, (observations, extraObservation) => {
      const before = possibleKeys(computeCandidates(cards, { observations }));
      const after = possibleKeys(computeCandidates(cards, {
        observations: [...observations, extraObservation],
      }));

      expect(after.length).toBeLessThanOrEqual(before.length);
    }));
  });

  test("failed prophecy markers do not remove possible candidates", () => {
    fc.assert(fc.property(observationsArb, fc.array(fc.constantFrom(...cardNames), { maxLength: 4 }), (observations, failedNames) => {
      const withoutFailedMarkers = possibleKeys(computeCandidates(cards, { observations }));
      const withFailedMarkers = possibleKeys(computeCandidates(cards, {
        observations,
        failedCandidateKeys: failedNames,
      }));

      expect(withFailedMarkers).toEqual(withoutFailedMarkers);
    }));
  });

  test("possible candidates are always enabled cards", () => {
    fc.assert(fc.property(observationsArb, (observations) => {
      const possible = possibleKeys(computeCandidates(cards, { observations }));

      expect(possible.every((key) => enabledKeys.has(key))).toBe(true);
    }));
  });

  test("condition summary only uses possible candidates", () => {
    fc.assert(fc.property(observationsArb, (observations) => {
      const candidates = computeCandidates(cards, { observations });
      const summary = getConditionSummary(candidates);
      const possibleRaces = [...new Set(candidates
        .filter((candidate) => candidate.possible)
        .map((candidate) => candidate.race)
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "ko"));

      expect(summary.races).toEqual(possibleRaces);
    }));
  });
});
