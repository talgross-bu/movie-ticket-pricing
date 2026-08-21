/**
 * Pure economic calculations and persistent-state helpers for the classroom game.
 * This module has no DOM dependencies so the game rules can be verified with Node.
 */

(function initializeGameLogic() {
"use strict";

const STATE_VERSION = 5;
const MARGINAL_COST = 1;
const CAPACITY = 60;
const MIN_PRICE = 1;
const MAX_PRICE = 10;
const ATTEMPTS_PER_ROUND = 3;

const MARKETS = Object.freeze({
  locals: Object.freeze({
    label: "Locals",
    values: Object.freeze([
      ...Array(10).fill(10),
      ...Array(10).fill(9),
      ...Array(10).fill(8),
    ]),
  }),
  students: Object.freeze({
    label: "College students",
    values: Object.freeze([
      ...Array(10).fill(6),
      ...Array(10).fill(5),
      ...Array(10).fill(4),
    ]),
  }),
});

const ROUNDS = Object.freeze({
  august: Object.freeze({
    label: "August",
    pricing: "uniform",
    activeMarkets: Object.freeze(["locals"]),
  }),
  september: Object.freeze({
    label: "September",
    pricing: "uniform",
    activeMarkets: Object.freeze(["locals", "students"]),
  }),
  october: Object.freeze({
    label: "October",
    pricing: "segmented",
    activeMarkets: Object.freeze(["locals", "students"]),
  }),
});

const DIRECTIONS = Object.freeze(["increase", "decrease", "same"]);
const ALLOWED_PHASES = Object.freeze([
  "share",
  "setup-august",
  "play-august",
  "review-august",
  "predict-september",
  "play-september",
  "review-september",
  "predict-october",
  "play-october",
  "review-october",
  "recap",
  "summary",
]);

function isAllowedPrice(price) {
  return Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE;
}

function demandAtPrice(marketId, price) {
  const market = MARKETS[marketId];
  if (!market) {
    throw new RangeError(`Unknown market: ${marketId}`);
  }
  if (!isAllowedPrice(price)) {
    throw new RangeError(`Price must be a whole dollar from ${MIN_PRICE} through ${MAX_PRICE}.`);
  }
  return market.values.filter((value) => value >= price).length;
}

function finishOutcome({ localPrice, studentPrice, localQuantity, studentQuantity }) {
  const totalQuantity = localQuantity + studentQuantity;
  const revenue = localPrice * localQuantity + studentPrice * studentQuantity;
  const cost = MARGINAL_COST * totalQuantity;
  return {
    localQuantity,
    studentQuantity,
    totalQuantity,
    seatsEmpty: CAPACITY - totalQuantity,
    revenue,
    cost,
    profit: revenue - cost,
  };
}

function uniformOutcome(roundId, price) {
  const round = ROUNDS[roundId];
  if (!round || round.pricing !== "uniform") {
    throw new RangeError(`Uniform pricing is unavailable for round: ${roundId}`);
  }
  if (!isAllowedPrice(price)) {
    throw new RangeError(`Price must be a whole dollar from ${MIN_PRICE} through ${MAX_PRICE}.`);
  }

  const localQuantity = demandAtPrice("locals", price);
  const studentQuantity = round.activeMarkets.includes("students")
    ? demandAtPrice("students", price)
    : 0;
  return {
    roundId,
    price,
    ...finishOutcome({
      localPrice: price,
      studentPrice: price,
      localQuantity,
      studentQuantity,
    }),
  };
}

function segmentedOutcome(localPrice, studentPrice) {
  if (!isAllowedPrice(localPrice) || !isAllowedPrice(studentPrice)) {
    throw new RangeError(
      `Both prices must be whole dollars from ${MIN_PRICE} through ${MAX_PRICE}.`,
    );
  }
  return {
    roundId: "october",
    localPrice,
    studentPrice,
    ...finishOutcome({
      localPrice,
      studentPrice,
      localQuantity: demandAtPrice("locals", localPrice),
      studentQuantity: demandAtPrice("students", studentPrice),
    }),
  };
}

function uniformProfitSchedule(roundId) {
  return Array.from({ length: MAX_PRICE - MIN_PRICE + 1 }, (_, index) =>
    uniformOutcome(roundId, MIN_PRICE + index),
  );
}

function marketProfitSchedule(marketId) {
  if (!MARKETS[marketId]) {
    throw new RangeError(`Unknown market: ${marketId}`);
  }
  return Array.from({ length: MAX_PRICE - MIN_PRICE + 1 }, (_, index) => {
    const price = MIN_PRICE + index;
    const quantity = demandAtPrice(marketId, price);
    return {
      marketId,
      price,
      quantity,
      profit: (price - MARGINAL_COST) * quantity,
    };
  });
}

function bestAttempt(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return null;
  }
  return attempts.reduce((best, attempt) =>
    attempt.profit > best.profit ? attempt : best,
  );
}

function bestFromSchedule(outcomes) {
  return bestAttempt(outcomes);
}

const BENCHMARKS = Object.freeze({
  august: Object.freeze(bestFromSchedule(uniformProfitSchedule("august"))),
  september: Object.freeze(bestFromSchedule(uniformProfitSchedule("september"))),
  october: Object.freeze(segmentedOutcome(8, 4)),
});

function makeInitialState() {
  return {
    version: STATE_VERSION,
    phase: "share",
    shareAcknowledged: false,
    attempts: {
      august: [],
      september: [],
      october: [],
    },
    predictions: {
      september: { profit: null, quantity: null },
      october: { profit: null, quantity: null },
    },
  };
}

function sameNumbers(candidate, expected, keys) {
  return keys.every((key) => candidate[key] === expected[key]);
}

function validAttempt(roundId, candidate) {
  if (!candidate || candidate.roundId !== roundId) {
    return false;
  }
  try {
    if (roundId === "october") {
      const expected = segmentedOutcome(candidate.localPrice, candidate.studentPrice);
      return sameNumbers(candidate, expected, [
        "localPrice",
        "studentPrice",
        "localQuantity",
        "studentQuantity",
        "totalQuantity",
        "seatsEmpty",
        "revenue",
        "cost",
        "profit",
      ]);
    }
    const expected = uniformOutcome(roundId, candidate.price);
    return sameNumbers(candidate, expected, [
      "price",
      "localQuantity",
      "studentQuantity",
      "totalQuantity",
      "seatsEmpty",
      "revenue",
      "cost",
      "profit",
    ]);
  } catch {
    return false;
  }
}

function normalizePrediction(candidate) {
  return {
    profit: DIRECTIONS.includes(candidate?.profit) ? candidate.profit : null,
    quantity: DIRECTIONS.includes(candidate?.quantity) ? candidate.quantity : null,
  };
}

function normalizeStoredState(candidate) {
  const initial = makeInitialState();
  if (!candidate || candidate.version !== STATE_VERSION) {
    return initial;
  }

  const phase = ALLOWED_PHASES.includes(candidate.phase) ? candidate.phase : "share";
  const attempts = {};
  for (const roundId of Object.keys(ROUNDS)) {
    const storedAttempts = candidate.attempts?.[roundId];
    attempts[roundId] = Array.isArray(storedAttempts)
      ? storedAttempts.filter((attempt) => validAttempt(roundId, attempt)).slice(0, ATTEMPTS_PER_ROUND)
      : [];
  }

  return {
    version: STATE_VERSION,
    phase,
    shareAcknowledged: candidate.shareAcknowledged === true,
    attempts,
    predictions: {
      september: normalizePrediction(candidate.predictions?.september),
      october: normalizePrediction(candidate.predictions?.october),
    },
  };
}

globalThis.MovieTicketGameLogic = Object.freeze({
  STATE_VERSION,
  MARGINAL_COST,
  CAPACITY,
  MIN_PRICE,
  MAX_PRICE,
  ATTEMPTS_PER_ROUND,
  MARKETS,
  ROUNDS,
  DIRECTIONS,
  ALLOWED_PHASES,
  BENCHMARKS,
  isAllowedPrice,
  demandAtPrice,
  uniformOutcome,
  segmentedOutcome,
  uniformProfitSchedule,
  marketProfitSchedule,
  bestAttempt,
  makeInitialState,
  normalizeStoredState,
});
}());
