import { describe, expect, test } from "vitest";
import { hasObservationForCard } from "../src/observations.js";

describe("observation helpers", () => {
  test("detects duplicate observations for the same result and card", () => {
    const observations = [
      { id: 1, result: "Y", cards: ["지원군 소환"] },
      { id: 2, result: "N", cards: ["바퀴 부대"] },
    ];

    expect(hasObservationForCard(observations, "Y", " 지원군   소환 ")).toBe(true);
    expect(hasObservationForCard(observations, "N", "지원군 소환")).toBe(false);
    expect(hasObservationForCard(observations, "Y", "지뢰밭")).toBe(false);
  });

  test("ignores invalid result or empty card names", () => {
    const observations = [{ id: 1, result: "Y", cards: ["지원군 소환"] }];

    expect(hasObservationForCard(observations, "X", "지원군 소환")).toBe(false);
    expect(hasObservationForCard(observations, "Y", "")).toBe(false);
  });
});
