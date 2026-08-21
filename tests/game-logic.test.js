/**
 * Verifies the 60-person demand model, monthly outcomes, benchmarks, and recovery.
 */

import test from "node:test";
import assert from "node:assert/strict";

await import("../game-logic.js");

const {
  STATE_VERSION,
  CAPACITY,
  MARKETS,
  BENCHMARKS,
  demandAtPrice,
  uniformOutcome,
  segmentedOutcome,
  uniformProfitSchedule,
  marketProfitSchedule,
  makeInitialState,
  normalizeStoredState,
} = globalThis.MovieTicketGameLogic;

test("market populations contain ten people at each willingness-to-pay value", () => {
  assert.equal(MARKETS.locals.values.length, 30);
  assert.equal(MARKETS.students.values.length, 30);
  assert.deepEqual(
    Object.fromEntries([8, 9, 10].map((value) => [value, MARKETS.locals.values.filter((item) => item === value).length])),
    { 8: 10, 9: 10, 10: 10 },
  );
  assert.deepEqual(
    Object.fromEntries([4, 5, 6].map((value) => [value, MARKETS.students.values.filter((item) => item === value).length])),
    { 4: 10, 5: 10, 6: 10 },
  );
  assert.equal(CAPACITY, 60);
});

test("demand schedules are correct at every permitted price", () => {
  const expectedLocals = [30, 30, 30, 30, 30, 30, 30, 30, 20, 10];
  const expectedStudents = [30, 30, 30, 30, 20, 10, 0, 0, 0, 0];
  for (let price = 1; price <= 10; price += 1) {
    assert.equal(demandAtPrice("locals", price), expectedLocals[price - 1]);
    assert.equal(demandAtPrice("students", price), expectedStudents[price - 1]);
  }
});

test("invalid prices and markets are rejected", () => {
  assert.throws(() => demandAtPrice("locals", 0), /whole dollar/);
  assert.throws(() => demandAtPrice("locals", 8.5), /whole dollar/);
  assert.throws(() => demandAtPrice("students", 11), /whole dollar/);
  assert.throws(() => demandAtPrice("tourists", 5), /Unknown market/);
});

test("monthly outcomes report sales, empty seats, revenue, cost, and profit", () => {
  assert.deepEqual(uniformOutcome("august", 8), {
    roundId: "august",
    price: 8,
    localQuantity: 30,
    studentQuantity: 0,
    totalQuantity: 30,
    seatsEmpty: 30,
    revenue: 240,
    cost: 30,
    profit: 210,
  });
  assert.deepEqual(uniformOutcome("september", 4), {
    roundId: "september",
    price: 4,
    localQuantity: 30,
    studentQuantity: 30,
    totalQuantity: 60,
    seatsEmpty: 0,
    revenue: 240,
    cost: 60,
    profit: 180,
  });
  assert.deepEqual(segmentedOutcome(8, 4), {
    roundId: "october",
    localPrice: 8,
    studentPrice: 4,
    localQuantity: 30,
    studentQuantity: 30,
    totalQuantity: 60,
    seatsEmpty: 0,
    revenue: 360,
    cost: 60,
    profit: 300,
  });
});

test("benchmarks are the unique whole-dollar profit maxima", () => {
  assert.deepEqual(BENCHMARKS.august, uniformOutcome("august", 8));
  assert.deepEqual(BENCHMARKS.september, uniformOutcome("september", 8));
  assert.deepEqual(BENCHMARKS.october, segmentedOutcome(8, 4));

  for (const roundId of ["august", "september"]) {
    const schedule = uniformProfitSchedule(roundId);
    const highestProfit = Math.max(...schedule.map(({ profit }) => profit));
    assert.deepEqual(schedule.filter(({ profit }) => profit === highestProfit).map(({ price }) => price), [8]);
  }

  const outcomes = [];
  for (let localPrice = 1; localPrice <= 10; localPrice += 1) {
    for (let studentPrice = 1; studentPrice <= 10; studentPrice += 1) {
      outcomes.push(segmentedOutcome(localPrice, studentPrice));
    }
  }
  const highestProfit = Math.max(...outcomes.map(({ profit }) => profit));
  assert.deepEqual(
    outcomes.filter(({ profit }) => profit === highestProfit).map(({ localPrice, studentPrice }) => ({ localPrice, studentPrice })),
    [{ localPrice: 8, studentPrice: 4 }],
  );
});

test("October accepts arbitrary price pairs", () => {
  assert.equal(segmentedOutcome(4, 8).profit, 90);
  assert.equal(segmentedOutcome(6, 6).profit, 200);
  assert.equal(segmentedOutcome(8, 4).profit, 300);
});

test("profit schedules expose every whole-dollar choice", () => {
  assert.deepEqual(
    uniformProfitSchedule("september").map(({ profit }) => profit),
    [0, 60, 120, 180, 200, 200, 180, 210, 160, 90],
  );
  assert.deepEqual(
    marketProfitSchedule("students").map(({ profit }) => profit),
    [0, 30, 60, 90, 80, 50, 0, 0, 0, 0],
  );
});

test("initial state starts at the screen-sharing gate", () => {
  assert.deepEqual(makeInitialState(), {
    version: STATE_VERSION,
    phase: "share",
    shareAcknowledged: false,
    attempts: { august: [], september: [], october: [] },
    predictions: {
      september: { profit: null, quantity: null },
      october: { profit: null, quantity: null },
    },
  });
});

test("stored valid attempts and partial predictions survive normalization", () => {
  const normalized = normalizeStoredState({
    ...makeInitialState(),
    phase: "predict-september",
    shareAcknowledged: true,
    attempts: {
      august: [uniformOutcome("august", 8)],
      september: [],
      october: [],
    },
    predictions: {
      september: { profit: "same", quantity: "invalid" },
      october: { profit: "increase", quantity: "increase" },
    },
  });
  assert.equal(normalized.phase, "predict-september");
  assert.equal(normalized.shareAcknowledged, true);
  assert.deepEqual(normalized.attempts.august, [uniformOutcome("august", 8)]);
  assert.deepEqual(normalized.predictions.september, { profit: "same", quantity: null });
  assert.deepEqual(normalized.predictions.october, { profit: "increase", quantity: "increase" });
});

test("invalid and excess stored attempts are discarded", () => {
  const valid = uniformOutcome("august", 8);
  const normalized = normalizeStoredState({
    ...makeInitialState(),
    attempts: {
      august: [valid, { ...valid, profit: 999 }, valid, valid, valid],
      september: "not-an-array",
      october: [segmentedOutcome(8, 4), { ...segmentedOutcome(8, 4), studentQuantity: 20 }],
    },
  });
  assert.equal(normalized.attempts.august.length, 3);
  assert.deepEqual(normalized.attempts.september, []);
  assert.deepEqual(normalized.attempts.october, [segmentedOutcome(8, 4)]);
});

test("legacy state resets safely", () => {
  assert.deepEqual(normalizeStoredState({ version: 4, phase: "uniform" }), makeInitialState());
  assert.deepEqual(normalizeStoredState({ version: 999 }), makeInitialState());
});
