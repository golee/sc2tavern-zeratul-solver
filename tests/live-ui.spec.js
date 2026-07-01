// @vitest-environment happy-dom
/* global document */

import { describe, expect, test } from "vitest";
import { renderInputGrid } from "../src/combobox.js";
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

    renderInputGrid(container, "liveCard", ["지원군 소환"], 1);
    const inputs = container.querySelectorAll("input");

    expect(inputs).toHaveLength(1);
    expect(inputs[0].id).toBe("liveCard1");
    expect(inputs[0].placeholder).toBe("카드명 입력/선택");
    expect(inputs[0].value).toBe("지원군 소환");
  });

  test("shows an empty state when no current turn card is selected", () => {
    const { liveBody } = liveFixture([""]);

    const emptyCell = liveBody.querySelector(".empty-row td");
    expect(emptyCell.colSpan).toBe(5);
    expect(emptyCell.textContent).toBe("현재 턴 카드가 없습니다.");
  });

  test("renders Y and N record buttons for a valid current turn card", () => {
    const { liveBody } = liveFixture(["지원군 소환"]);
    const buttons = [...liveBody.querySelectorAll('button[data-action="record-live-observation"]')];

    expect(liveBody.querySelectorAll("tr")).toHaveLength(1);
    expect(liveBody.textContent).toContain("지원군 소환");
    expect(liveBody.textContent).toContain("정답 후보. 관측 결과를 기록하세요.");
    expect(buttons.map((button) => button.textContent)).toEqual(["Y 기록", "N 기록"]);
    expect(buttons.map((button) => button.dataset.result)).toEqual(["Y", "N"]);
    expect(buttons.every((button) => button.dataset.cardName === "지원군 소환")).toBe(true);
    expect(buttons.every((button) => !button.disabled)).toBe(true);
  });

  test("disables record buttons for a card that is not in the pool", () => {
    const { liveBody } = liveFixture(["없는카드"]);
    const buttons = [...liveBody.querySelectorAll('button[data-action="record-live-observation"]')];

    expect(liveBody.textContent).toContain("카드풀 없음");
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});
