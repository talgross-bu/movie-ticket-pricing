/**
 * Pure economic calculations and persistent-state helpers for the classroom game.
 * This module has no DOM dependencies so the game rules can be verified with Node.
 */

(function initializeGameLogic() {
"use strict";

const STATE_VERSION = 3;
const MARGINAL_COST = 1;
const MIN_PRICE = 1;
const MAX_PRICE = 10;
const ATTEMPTS_PER_TREATMENT = 3;

const MARKETS = Object.freeze({
  high: Object.freeze({
    label: "Local movie fans",
    shortLabel: "Movie fans",
    values: Object.freeze([10, 9, 8]),
  }),
  low: Object.freeze({
    label: "Verified students",
    shortLabel: "Students",
    values: Object.freeze([6, 5, 4]),
  }),
});

const ROLE_OPTIONS = Object.freeze({
  3: Object.freeze([
    Object.freeze({
      id: "combined-controller",
      title: "Theater manager + controller",
      subtitle: "Set ticket prices, record sales, and speak for the room",
      isController: true,
    }),
    Object.freeze({
      id: "high-market",
      title: "Local movie fans",
      subtitle: "Privately represent three general-admission customers",
      isController: false,
    }),
    Object.freeze({
      id: "low-market",
      title: "Verified students",
      subtitle: "Privately represent three student customers",
      isController: false,
    }),
  ]),
  4: Object.freeze([
    Object.freeze({
      id: "theater-manager",
      title: "Theater manager",
      subtitle: "Choose the ticket prices",
      isController: false,
    }),
    Object.freeze({
      id: "analyst-controller",
      title: "Ticketing analyst + controller",
      subtitle: "Record ticket sales and speak for the room",
      isController: true,
    }),
    Object.freeze({
      id: "high-market",
      title: "Local movie fans",
      subtitle: "Privately represent three general-admission customers",
      isController: false,
    }),
    Object.freeze({
      id: "low-market",
      title: "Verified students",
      subtitle: "Privately represent three student customers",
      isController: false,
    }),
  ]),
});

function isAllowedPrice(price) {
  return Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE;
}

function demandAtPrice(marketId, price) {
  if (!Object.hasOwn(MARKETS, marketId)) {
    throw new RangeError(`Unknown market: ${marketId}`);
  }
  if (!isAllowedPrice(price)) {
    throw new RangeError(`Price must be a whole dollar from ${MIN_PRICE} through ${MAX_PRICE}.`);
  }

  return MARKETS[marketId].values.filter((value) => value >= price).length;
}

function profitForUniformPrice(price, highQuantity, lowQuantity) {
  return (price - MARGINAL_COST) * (highQuantity + lowQuantity);
}

function profitForGroupPrices(highPrice, highQuantity, lowPrice, lowQuantity) {
  return (
    (highPrice - MARGINAL_COST) * highQuantity +
    (lowPrice - MARGINAL_COST) * lowQuantity
  );
}

function validateUniformReport({ price, highQuantity, lowQuantity }) {
  if (!isAllowedPrice(price)) {
    return { valid: false, reason: "price" };
  }
  const quantitiesAreIntegers = [highQuantity, lowQuantity].every(
    (quantity) => Number.isInteger(quantity) && quantity >= 0 && quantity <= 3,
  );
  if (!quantitiesAreIntegers) {
    return { valid: false, reason: "quantity" };
  }

  const reportsMatch =
    highQuantity === demandAtPrice("high", price) &&
    lowQuantity === demandAtPrice("low", price);
  return { valid: reportsMatch, reason: reportsMatch ? null : "mismatch" };
}

function validateGroupReport({ highPrice, highQuantity, lowPrice, lowQuantity }) {
  if (!isAllowedPrice(highPrice) || !isAllowedPrice(lowPrice)) {
    return { valid: false, reason: "price" };
  }
  const quantitiesAreIntegers = [highQuantity, lowQuantity].every(
    (quantity) => Number.isInteger(quantity) && quantity >= 0 && quantity <= 3,
  );
  if (!quantitiesAreIntegers) {
    return { valid: false, reason: "quantity" };
  }

  const reportsMatch =
    highQuantity === demandAtPrice("high", highPrice) &&
    lowQuantity === demandAtPrice("low", lowPrice);
  return { valid: reportsMatch, reason: reportsMatch ? null : "mismatch" };
}

function makeUniformAttempt(price, highQuantity, lowQuantity) {
  return {
    price,
    highQuantity,
    lowQuantity,
    totalQuantity: highQuantity + lowQuantity,
    profit: profitForUniformPrice(price, highQuantity, lowQuantity),
  };
}

function makeGroupAttempt(highPrice, highQuantity, lowPrice, lowQuantity) {
  return {
    highPrice,
    highQuantity,
    lowPrice,
    lowQuantity,
    totalQuantity: highQuantity + lowQuantity,
    profit: profitForGroupPrices(highPrice, highQuantity, lowPrice, lowQuantity),
  };
}

function outcomeForQuantities(highQuantity, lowQuantity, highPrice, lowPrice = highPrice) {
  const servedHighValues = MARKETS.high.values.slice(0, highQuantity);
  const servedLowValues = MARKETS.low.values.slice(0, lowQuantity);
  const totalQuantity = highQuantity + lowQuantity;
  const totalValue = [...servedHighValues, ...servedLowValues].reduce(
    (sum, value) => sum + value,
    0,
  );
  const consumerSurplus =
    servedHighValues.reduce((sum, value) => sum + value - highPrice, 0) +
    servedLowValues.reduce((sum, value) => sum + value - lowPrice, 0);
  const profit = profitForGroupPrices(
    highPrice,
    highQuantity,
    lowPrice,
    lowQuantity,
  );

  return {
    totalQuantity,
    profit,
    consumerSurplus,
    totalSurplus: totalValue - MARGINAL_COST * totalQuantity,
  };
}

const BENCHMARKS = Object.freeze({
  uniform: Object.freeze({
    price: 8,
    highQuantity: 3,
    lowQuantity: 0,
    ...outcomeForQuantities(3, 0, 8),
  }),
  group: Object.freeze({
    highPrice: 8,
    lowPrice: 4,
    highQuantity: 3,
    lowQuantity: 3,
    ...outcomeForQuantities(3, 3, 8, 4),
  }),
});

function bestAttempt(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return null;
  }
  return attempts.reduce((best, attempt) =>
    attempt.profit > best.profit ? attempt : best,
  );
}

function rolesForGroup(groupSize) {
  return ROLE_OPTIONS[groupSize] ?? [];
}

function roleForState(groupSize, roleId) {
  return rolesForGroup(groupSize).find((role) => role.id === roleId) ?? null;
}

function makeInitialState() {
  return {
    version: STATE_VERSION,
    groupSize: null,
    role: null,
    phase: "landing",
    uniformAttempts: [],
    groupAttempts: [],
    completed: false,
  };
}

function validUniformAttempt(attempt) {
  return (
    attempt &&
    validateUniformReport(attempt).valid &&
    attempt.profit ===
      profitForUniformPrice(attempt.price, attempt.highQuantity, attempt.lowQuantity)
  );
}

function validGroupAttempt(attempt) {
  return (
    attempt &&
    validateGroupReport(attempt).valid &&
    attempt.profit ===
      profitForGroupPrices(
        attempt.highPrice,
        attempt.highQuantity,
        attempt.lowPrice,
        attempt.lowQuantity,
      )
  );
}

function normalizeStoredState(candidate) {
  const initial = makeInitialState();
  if (!candidate || candidate.version !== STATE_VERSION) {
    return initial;
  }
  if (![null, 3, 4].includes(candidate.groupSize)) {
    return initial;
  }
  const role = candidate.role === null
    ? null
    : roleForState(candidate.groupSize, candidate.role);
  if (candidate.role !== null && !role) {
    return initial;
  }
  const allowedPhases = [
    "landing",
    "roles",
    "setup",
    "uniform",
    "group",
    "reveal",
    "discussion",
    "answers",
  ];
  const phase = allowedPhases.includes(candidate.phase) ? candidate.phase : "landing";
  const uniformAttempts = Array.isArray(candidate.uniformAttempts)
    ? candidate.uniformAttempts.filter(validUniformAttempt).slice(0, ATTEMPTS_PER_TREATMENT)
    : [];
  const groupAttempts = Array.isArray(candidate.groupAttempts)
    ? candidate.groupAttempts.filter(validGroupAttempt).slice(0, ATTEMPTS_PER_TREATMENT)
    : [];

  return {
    version: STATE_VERSION,
    groupSize: candidate.groupSize,
    role: role?.id ?? null,
    phase,
    uniformAttempts,
    groupAttempts,
    completed: candidate.completed === true,
  };
}

globalThis.TwoMarketsGameLogic = Object.freeze({
  STATE_VERSION,
  MARGINAL_COST,
  MIN_PRICE,
  MAX_PRICE,
  ATTEMPTS_PER_TREATMENT,
  MARKETS,
  ROLE_OPTIONS,
  isAllowedPrice,
  demandAtPrice,
  profitForUniformPrice,
  profitForGroupPrices,
  validateUniformReport,
  validateGroupReport,
  makeUniformAttempt,
  makeGroupAttempt,
  outcomeForQuantities,
  BENCHMARKS,
  bestAttempt,
  rolesForGroup,
  roleForState,
  makeInitialState,
  normalizeStoredState,
});
}());
