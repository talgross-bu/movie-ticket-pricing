/**
 * Simulates a spokesperson completing every interaction without a browser dependency.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script, createContext } from "node:vm";

const projectRoot = new URL("../", import.meta.url);

test("a spokesperson can complete the full exercise and reach the reveal", async () => {
  const [logicSource, appSource] = await Promise.all([
    readFile(new URL("game-logic.js", projectRoot), "utf8"),
    readFile(new URL("app.js", projectRoot), "utf8"),
  ]);
  const handlers = {};
  const fields = new Map();
  let stored = null;
  const appElement = {
    innerHTML: "",
    addEventListener(type, handler) { handlers[type] = handler; },
  };
  const context = createContext({
    document: {
      querySelector(selector) {
        if (selector === "#app") return appElement;
        return fields.get(selector) ?? null;
      },
    },
    window: {
      localStorage: {
        getItem() { return stored; },
        setItem(_key, value) { stored = value; },
        removeItem() { stored = null; },
      },
      scrollTo() {},
      confirm() { return true; },
    },
  });
  new Script(logicSource, { filename: "game-logic.js" }).runInContext(context);
  new Script(appSource, { filename: "app.js" }).runInContext(context);

  function clickAction(action, dataset = {}) {
    const target = {
      dataset: { action, ...dataset },
      closest(selector) {
        if (selector === "[data-prediction-round]") return null;
        if (selector === "[data-action]") return this;
        return null;
      },
    };
    handlers.click({ target });
  }

  function clickPrediction(roundId, kind, direction) {
    const target = {
      dataset: {
        predictionRound: roundId,
        predictionKind: kind,
        direction,
      },
      closest(selector) {
        return selector === "[data-prediction-round]" ? this : null;
      },
    };
    handlers.click({ target });
  }

  function submitUniform(roundId, price) {
    fields.set("#uniform-price", { value: String(price) });
    handlers.submit({
      preventDefault() {},
      target: { id: "uniform-form", dataset: { round: roundId } },
    });
  }

  function submitOctober(localPrice, studentPrice) {
    fields.set("#local-price", { value: String(localPrice) });
    fields.set("#student-price", { value: String(studentPrice) });
    handlers.submit({ preventDefault() {}, target: { id: "segmented-form", dataset: {} } });
  }

  assert.match(appElement.innerHTML, /Share your screen/);
  clickAction("ack-share");
  assert.match(appElement.innerHTML, />Start<\/button>/);
  clickAction("start");
  assert.match(appElement.innerHTML, /August in a small college town/);
  clickAction("begin-august");

  for (const price of [7, 8, 9]) submitUniform("august", price);
  assert.match(appElement.innerHTML, /All three prices are recorded/);
  clickAction("review-august");
  assert.match(appElement.innerHTML, /best result was \$210/);
  clickAction("predict-september");
  clickPrediction("september", "profit", "same");
  clickPrediction("september", "quantity", "same");
  clickAction("begin-september");

  for (const price of [4, 6, 8]) submitUniform("september", price);
  clickAction("review-september");
  assert.match(appElement.innerHTML, /Compared with your August best/);
  assert.doesNotMatch(appElement.innerHTML, /Answer:/);
  clickAction("predict-october");
  clickPrediction("october", "profit", "increase");
  clickPrediction("october", "quantity", "increase");
  clickAction("begin-october");

  for (const [localPrice, studentPrice] of [[6, 6], [8, 5], [8, 4]]) {
    submitOctober(localPrice, studentPrice);
  }
  assert.match(appElement.innerHTML, /30 local · 30 student/);
  clickAction("review-october");
  assert.match(appElement.innerHTML, /best result was \$300/);
  clickAction("open-recap");
  assert.match(appElement.innerHTML, /Three months at the box office/);
  assert.doesNotMatch(appElement.innerHTML, /The economic answer/);
  clickAction("open-summary");
  assert.match(appElement.innerHTML, /The economic answer/);
  assert.match(appElement.innerHTML, /Answer: Stay the same/);
  assert.match(appElement.innerHTML, /Answer: Increase/);

  const finalState = JSON.parse(stored);
  assert.equal(finalState.phase, "summary");
  assert.equal(finalState.attempts.august.length, 3);
  assert.equal(finalState.attempts.september.length, 3);
  assert.equal(finalState.attempts.october.length, 3);
});
