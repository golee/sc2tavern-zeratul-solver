// @vitest-environment happy-dom
/* global document, window */

import { expect, test } from "vitest";
import page from "../index.html?raw";

test("restores renamed observations and failed candidates when opening an old session", async () => {
  const template = document.createElement("template");
  template.innerHTML = page;
  document.body.append(template.content.querySelector("main"), template.content.querySelector("#toast"));
  window.sessionStorage.setItem("zeratulResolver.observations.v1", JSON.stringify([
    { result: "Y", cards: ["뮤탈리스크 공습", "지뢰밭"] },
    { result: "N", cards: ["영웅 광전사", "레이너"] },
    { result: "Y", cards: ["바퀴 부대"] },
  ]));
  window.sessionStorage.setItem("zeratulResolver.failedCandidates.v1", JSON.stringify(["바퀴 부대"]));

  await import("../app.js");

  const observed = [...document.querySelectorAll(".observation-card-cell")].map((cell) => cell.textContent);
  expect(observed).toEqual(["특전병", "바퀴 분대"]);
  expect(document.querySelector('#candidateBody button[data-action="restore-candidate"][data-card-key="바퀴 분대"]')).toBeTruthy();
});
