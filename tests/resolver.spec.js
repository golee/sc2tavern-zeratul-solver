import { describe, expect, test } from "vitest";
import { ZERATUL_DEFAULT_CARD_POOL } from "../cardpool-data.js";
import {
  computeCandidates,
  computeLiveRecommendations,
  getConditionSummary,
  normalizeStoredObservations,
  parseCardPool,
} from "../src/resolver.js";

const fixturePoolText = `
카드명	종족/타입	티어	사용 여부	메모
지원군 소환	프로토스	1	Y	출처:테스트; 유닛:1; 가치:100
바퀴 부대	저그	1	Y	출처:테스트; 유닛:2; 가치:500
지뢰밭	테란	3	Y	출처:테스트; 유닛:1; 가치:900
황금 함대	프로토스	5	Y	출처:테스트; 유닛:7; 가치:2000
비활성 카드	중립	6	N	출처:테스트; 유닛:1; 가치:100
`;

function possibleNames(candidates) {
  return candidates
    .filter((candidate) => candidate.possible)
    .map((candidate) => candidate.name)
    .sort((left, right) => left.localeCompare(right, "ko"));
}

describe("resolver deterministic behavior", () => {
  test("parses the real card pool and keeps known cards available", () => {
    const cards = parseCardPool(ZERATUL_DEFAULT_CARD_POOL);
    const names = new Set(cards.map((card) => card.name));

    expect(cards.length).toBeGreaterThan(100);
    expect(names.has("지원군 소환")).toBe(true);
    expect(names.has("넋 잃는 자둬바오")).toBe(true);
    expect(cards.every((card) => card.key)).toBe(true);
  });

  test("returns all enabled cards when there is no observation", () => {
    const cards = parseCardPool(fixturePoolText);
    const candidates = computeCandidates(cards);

    expect(possibleNames(candidates)).toEqual([
      "바퀴 부대",
      "지뢰밭",
      "지원군 소환",
      "황금 함대",
    ]);
  });

  test("applies Y observations to keep matching candidate conditions", () => {
    const cards = parseCardPool(fixturePoolText);
    const candidates = computeCandidates(cards, {
      observations: [{ id: 1, result: "Y", cards: ["지원군 소환"] }],
    });

    expect(possibleNames(candidates)).toEqual([
      "지뢰밭",
      "지원군 소환",
      "황금 함대",
    ]);
  });

  test("applies N observations to remove matching candidate conditions", () => {
    const cards = parseCardPool(fixturePoolText);
    const candidates = computeCandidates(cards, {
      observations: [{ id: 1, result: "N", cards: ["지원군 소환"] }],
    });

    expect(possibleNames(candidates)).toEqual(["바퀴 부대"]);
  });

  test("summarizes conditions from possible candidates only", () => {
    const cards = parseCardPool(fixturePoolText);
    const candidates = computeCandidates(cards, {
      observations: [{ id: 1, result: "Y", cards: ["지원군 소환"] }],
    });
    const summary = getConditionSummary(candidates);

    expect(summary.races).toEqual(["테란", "프로토스"]);
    expect(summary.valueRangeText).toBe("100, 900, 2,000");
    expect(summary.unitRangeText).toBe("1, 7");
  });

  test("marks failed prophecy candidates without removing them from possible candidates", () => {
    const cards = parseCardPool(fixturePoolText);
    const candidates = computeCandidates(cards, {
      observations: [{ id: 1, result: "Y", cards: ["지원군 소환"] }],
      failedCandidateKeys: ["지원군 소환"],
    });
    const failed = candidates.find((candidate) => candidate.name === "지원군 소환");

    expect(failed.possible).toBe(true);
    expect(failed.manuallyFailed).toBe(true);
    expect(possibleNames(candidates)).toContain("지원군 소환");
  });

  test("ranks current turn cards by guaranteed candidate reduction", () => {
    const cards = parseCardPool(fixturePoolText);
    const candidates = computeCandidates(cards, {
      currentCards: ["지원군 소환", "지뢰밭", "바퀴 부대"],
    });
    const recommendations = computeLiveRecommendations(cards, {
      candidates,
      currentCards: ["지원군 소환", "지뢰밭", "바퀴 부대"],
    });

    expect(recommendations.map((recommendation) => recommendation.name)).toEqual([
      "지뢰밭",
      "지원군 소환",
      "바퀴 부대",
    ]);
    expect(recommendations[0]).toMatchObject({
      label: "강력",
      possibleCount: 4,
      yMatches: 2,
      nMatches: 2,
      guaranteedEliminated: 2,
    });
    expect(recommendations[1]).toMatchObject({
      label: "추천",
      yMatches: 3,
      nMatches: 1,
      guaranteedEliminated: 1,
    });
  });

  test("normalizes stored observations and drops invalid entries", () => {
    const observations = normalizeStoredObservations([
      { id: 99, result: "Y", cards: ["지원군 소환", "지원군 소환", ""] },
      { result: "X", cards: ["바퀴 부대"] },
      { result: "N", cards: [] },
      { result: "N", cards: ["바퀴 부대"] },
    ], 10);

    expect(observations).toEqual([
      { id: 1, result: "Y", cards: ["지원군 소환"] },
      { id: 2, result: "N", cards: ["바퀴 부대"] },
    ]);
  });
});
