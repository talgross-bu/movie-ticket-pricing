/**
 * Verifies the economic rules, benchmarks, roles, and state recovery.
 */

import test from "node:test";
import assert from "node:assert/strict";

await import("../game-logic.js");

const {
  BENCHMARKS,
  demandAtPrice,
  makeGroupAttempt,
  makeInitialState,
  makeUniformAttempt,
  normalizeStoredState,
  outcomeForQuantities,
  profitForGroupPrices,
  profitForUniformPrice,
  rolesForGroup,
  validateGroupReport,
  validateUniformReport,
} = globalThis.TwoMarketsGameLogic;

test("demand schedules are correct at every allowed price", () => {
  const expectedHigh = [3, 3, 3, 3, 3, 3, 3, 3, 2, 1];
  const expectedLow = [3, 3, 3, 3, 2, 1, 0, 0, 0, 0];

  for (let price = 1; price <= 10; price += 1) {
    assert.equal(demandAtPrice("high", price), expectedHigh[price - 1]);
    assert.equal(demandAtPrice("low", price), expectedLow[price - 1]);
  }
});

test("prices outside the whole-dollar range are rejected", () => {
  assert.throws(() => demandAtPrice("high", 0), /whole dollar/);
  assert.throws(() => demandAtPrice("high", 8.5), /whole dollar/);
  assert.throws(() => demandAtPrice("low", 11), /whole dollar/);
});

test("benchmark profits and total surplus match the lesson", () => {
  assert.equal(profitForUniformPrice(8, 3, 0), 21);
  assert.equal(profitForGroupPrices(8, 3, 4, 3), 30);
  assert.deepEqual(BENCHMARKS.uniform, {
    price: 8,
    highQuantity: 3,
    lowQuantity: 0,
    totalQuantity: 3,
    profit: 21,
    consumerSurplus: 3,
    totalSurplus: 24,
  });
  assert.deepEqual(BENCHMARKS.group, {
    highPrice: 8,
    lowPrice: 4,
    highQuantity: 3,
    lowQuantity: 3,
    totalQuantity: 6,
    profit: 30,
    consumerSurplus: 6,
    totalSurplus: 36,
  });
});

test("benchmarks are the unique integer-price profit maxima", () => {
  const uniformOutcomes = Array.from({ length: 10 }, (_, index) => {
    const price = index + 1;
    const highQuantity = demandAtPrice("high", price);
    const lowQuantity = demandAtPrice("low", price);
    return {
      price,
      profit: profitForUniformPrice(price, highQuantity, lowQuantity),
    };
  });
  const highestUniformProfit = Math.max(...uniformOutcomes.map(({ profit }) => profit));
  assert.deepEqual(
    uniformOutcomes.filter(({ profit }) => profit === highestUniformProfit),
    [{ price: 8, profit: 21 }],
  );

  const groupOutcomes = [];
  for (let highPrice = 1; highPrice <= 10; highPrice += 1) {
    for (let lowPrice = 1; lowPrice <= 10; lowPrice += 1) {
      groupOutcomes.push({
        highPrice,
        lowPrice,
        profit: profitForGroupPrices(
          highPrice,
          demandAtPrice("high", highPrice),
          lowPrice,
          demandAtPrice("low", lowPrice),
        ),
      });
    }
  }
  const highestGroupProfit = Math.max(...groupOutcomes.map(({ profit }) => profit));
  assert.deepEqual(
    groupOutcomes.filter(({ profit }) => profit === highestGroupProfit),
    [{ highPrice: 8, lowPrice: 4, profit: 30 }],
  );
});

test("total surplus uses the customers with the highest values first", () => {
  assert.deepEqual(outcomeForQuantities(2, 1, 9, 6), {
    totalQuantity: 3,
    profit: 21,
    consumerSurplus: 1,
    totalSurplus: 22,
  });
});

test("reports are checked without returning the incorrect market", () => {
  assert.deepEqual(
    validateUniformReport({ price: 8, highQuantity: 3, lowQuantity: 0 }),
    { valid: true, reason: null },
  );
  assert.deepEqual(
    validateUniformReport({ price: 8, highQuantity: 2, lowQuantity: 0 }),
    { valid: false, reason: "mismatch" },
  );
  assert.deepEqual(
    validateGroupReport({ highPrice: 8, highQuantity: 3, lowPrice: 4, lowQuantity: 3 }),
    { valid: true, reason: null },
  );
  assert.deepEqual(
    validateGroupReport({ highPrice: 8, highQuantity: 3, lowPrice: 4, lowQuantity: 2 }),
    { valid: false, reason: "mismatch" },
  );
});

test("groups of three and four expose exactly one spokesperson first", () => {
  for (const groupSize of [3, 4]) {
    const roles = rolesForGroup(groupSize);
    assert.equal(roles.length, groupSize);
    assert.equal(roles[0].title, "Spokesperson");
    assert.equal(roles[0].isSpokesperson, true);
    assert.equal(roles.filter((role) => role.isSpokesperson).length, 1);
    assert.equal(roles.filter((role) => role.id.endsWith("market")).length, 2);
  }
});

test("stored spokesperson state survives normalization and invalid attempts do not", () => {
  const initial = makeInitialState();
  const validUniform = makeUniformAttempt(8, 3, 0);
  const validGroup = makeGroupAttempt(8, 3, 4, 3);
  const normalized = normalizeStoredState({
    ...initial,
    groupSize: 3,
    role: "combined-controller",
    phase: "reveal",
    uniformAttempts: [validUniform, { ...validUniform, highQuantity: 2 }],
    groupAttempts: [validGroup],
  });

  assert.equal(normalized.phase, "reveal");
  assert.deepEqual(normalized.uniformAttempts, [validUniform]);
  assert.deepEqual(normalized.groupAttempts, [validGroup]);
});

test("the retired answer-key phase falls back to the landing screen", () => {
  const normalized = normalizeStoredState({
    ...makeInitialState(),
    groupSize: 3,
    role: "combined-controller",
    phase: "answers",
  });

  assert.equal(normalized.phase, "landing");
});

test("checked discussion questions survive refresh and drop invalid entries", () => {
  const normalized = normalizeStoredState({
    ...makeInitialState(),
    groupSize: 3,
    role: "combined-controller",
    phase: "discussion",
    checkedQuestions: [1, 3, 1, "2", 9, 0],
  });

  assert.deepEqual(normalized.checkedQuestions, [1, 3]);
  assert.deepEqual(normalizeStoredState(makeInitialState()).checkedQuestions, []);
});

test("incompatible stored state resets safely", () => {
  assert.deepEqual(normalizeStoredState({ version: 999 }), makeInitialState());
  assert.deepEqual(
    normalizeStoredState({ version: 1, groupSize: 4, role: "not-a-role" }),
    makeInitialState(),
  );
});
