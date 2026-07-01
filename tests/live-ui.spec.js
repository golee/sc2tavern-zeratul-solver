// @vitest-environment happy-dom
/* global document */

import { describe, expect, test } from "vitest";
import { createComboboxController, renderInputGrid } from "../src/combobox.js";
import { renderLive } from "../src/renderers.js";
import { computeCandidates, parseCardPool } from "../src/resolver.js";

const fixturePoolText = `
카드명	종족/타입	티어	사용 여부	메모
지원군 소환	프로토스	1	Y	출처:테스트; 유닛:1; 가치:100
바퀴 부대	저그	1	Y	출처:테스트; 유닛:2; 가치:500
비활성 카드	중립	6	N	출처:테스트; 유닛:1; 가치:100
`;

function liveFixture(currentCards) {
  const cards = parseCardPool(fixturePoolText);
  const state = { currentCards };
  const candidates = computeCandidates(cards, { currentCards });
  const liveBody = document.createElement("tbody");

  renderLive({ el: { liveBody }, state, candidates });

  return { liveBody };
}

describe("current turn UI", () => {
  test("renders a single live card input even after a previous multi-input render", () => {
    const container = document.createElement("div");

    renderInputGrid(container, "liveCard", Array(10).fill(""), 10);
    expect(container.querySelectorAll("input")).toHaveLength(10);

    renderInputGrid(container, "liveCard", [""], 1);
    const inputs = container.querySelectorAll("input");

    expect(inputs).toHaveLength(1);
    expect(inputs[0].id).toBe("liveCard1");
    expect(inputs[0].placeholder).toBe("카드명 입력/선택");
    expect(inputs[0].value).toBe("");
  });

  test("shows an empty state when no current turn card is selected", () => {
    const { liveBody } = liveFixture([""]);

    const emptyCell = liveBody.querySelector(".empty-row td");
    expect(emptyCell.colSpan).toBe(4);
    expect(emptyCell.textContent).toBe("현재 턴 카드가 없습니다.");
  });

  test("renders accumulated current turn cards with record and delete actions", () => {
    const { liveBody } = liveFixture(["지원군 소환", "바퀴 부대"]);
    const buttons = [...liveBody.querySelectorAll('button[data-action="record-live-observation"]')];
    const deleteButtons = [...liveBody.querySelectorAll('button[data-action="delete-live-card"]')];

    expect(liveBody.querySelectorAll("tr")).toHaveLength(2);
    expect(liveBody.textContent).toContain("지원군 소환");
    expect(liveBody.textContent).toContain("바퀴 부대");
    expect(liveBody.textContent).not.toContain("정답 후보");
    expect(buttons.map((button) => button.textContent)).toEqual(["Y 기록", "N 기록", "Y 기록", "N 기록"]);
    expect(buttons.map((button) => button.dataset.result)).toEqual(["Y", "N", "Y", "N"]);
    expect(buttons.map((button) => button.dataset.cardName)).toEqual(["지원군 소환", "지원군 소환", "바퀴 부대", "바퀴 부대"]);
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    expect(deleteButtons.map((button) => button.dataset.index)).toEqual(["0", "1"]);
  });

  test("live combobox adds exact cards instead of replacing the current turn list", () => {
    const container = document.createElement("div");
    const addedCards = [];
    const card = { name: "지원군 소환" };
    renderInputGrid(container, "liveCard", [""], 1);

    const input = container.querySelector("input");
    const controller = createComboboxController({
      addLiveCard: (cardName) => addedCards.push(cardName),
      addObservation: () => {},
      findCard: (value) => value === card.name ? card : null,
      getCardSuggestions: () => [card],
    });

    input.value = "지원군 소환";
    controller.handleInput({ target: input, isComposing: false });

    expect(addedCards).toEqual(["지원군 소환"]);
    expect(input.value).toBe("");
  });
});
