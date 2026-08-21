/**
 * Single-screen classroom experience for the movie-ticket pricing exercise.
 * All calculations and saved progress stay in this browser.
 */

const {
  STATE_VERSION,
  MARGINAL_COST,
  CAPACITY,
  MIN_PRICE,
  MAX_PRICE,
  ATTEMPTS_PER_ROUND,
  MARKETS,
  ROUNDS,
  BENCHMARKS,
  DIRECTIONS,
  bestAttempt,
  uniformOutcome,
  segmentedOutcome,
  uniformProfitSchedule,
  marketProfitSchedule,
  makeInitialState,
  normalizeStoredState,
} = globalThis.MovieTicketGameLogic;

const STORAGE_KEY = `movie-ticket-pricing-challenge-state-v${STATE_VERSION}`;
const app = document.querySelector("#app");
let storageAvailable = true;
let state = loadState();

function loadState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeStoredState(JSON.parse(stored)) : makeInitialState();
  } catch {
    storageAvailable = false;
    return makeInitialState();
  }
}

function persistState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    storageAvailable = false;
  }
}

function updateState(changes) {
  state = normalizeStoredState({ ...state, ...changes });
  persistState();
  render();
}

function setPhase(phase) {
  updateState({ phase });
}

function resetActivity(askFirst = true) {
  const hasProgress = Object.values(state.attempts).some((attempts) => attempts.length > 0);
  if (
    askFirst &&
    hasProgress &&
    !window.confirm("Redo the exercise? All attempts and predictions on this device will be cleared.")
  ) {
    return;
  }
  state = makeInitialState();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    storageAvailable = false;
  }
  render();
}

function money(value) {
  return `$${value}`;
}

function signedMoney(value) {
  if (value === 0) {
    return "$0";
  }
  return `${value > 0 ? "+" : "−"}$${Math.abs(value)}`;
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return value === 1 ? singular : pluralForm;
}

function storageNotice() {
  if (storageAvailable) {
    return "";
  }
  return `
    <div class="notice notice--warning" role="status">
      <strong>Refresh recovery is unavailable.</strong>
      Keep this tab open because this browser is blocking local storage.
    </div>
  `;
}

function progress(activeStep) {
  const steps = [
    ["august", "Aug"],
    ["september", "Sep"],
    ["october", "Oct"],
    ["recap", "Recap"],
    ["summary", "Reveal"],
  ];
  const activeIndex = steps.findIndex(([id]) => id === activeStep);
  return `
    <ol class="progress" aria-label="Exercise progress">
      ${steps.map(([id, label], index) => {
        const status = index < activeIndex
          ? "is-complete"
          : index === activeIndex
            ? "is-active"
            : "";
        const current = index === activeIndex ? ' aria-current="step"' : "";
        return `<li class="${status}"${current}><span>${index + 1}</span>${label}</li>`;
      }).join("")}
    </ol>
  `;
}

function pageShell(content, { activeStep = null, narrow = false, showReset = true } = {}) {
  return `
    <div class="page-shell ${narrow ? "page-shell--narrow" : ""}">
      ${storageNotice()}
      ${activeStep ? progress(activeStep) : ""}
      ${content}
      ${showReset
        ? '<div class="utility-row"><button class="button button--text" type="button" data-action="reset">Start over on this device</button></div>'
        : ""}
    </div>
  `;
}

function renderShareGate() {
  const acknowledged = state.shareAcknowledged;
  app.innerHTML = `
    <section class="share-gate">
      <button
        class="share-button ${acknowledged ? "is-ready" : ""}"
        type="button"
        data-action="${acknowledged ? "start" : "ack-share"}"
      >${acknowledged ? "Start" : "Share your screen"}</button>
    </section>
  `;
}

function renderAugustSetup() {
  app.innerHTML = pageShell(`
    <section class="setup-hero">
      <div>
        <span class="eyebrow">The Movie Ticket Pricing Challenge</span>
        <h1>August in a small college town</h1>
        <p class="lede">College is out of session. Only the town’s 30 local residents are around, and your group runs the only movie theater.</p>
      </div>
      <img src="assets/movie-ticket-hero.jpg" alt="Two blank movie tickets beside popcorn in a theater.">
    </section>

    <section class="fact-grid" aria-label="Facts known at the start">
      <article><strong>60</strong><span>seats in the theater</span></article>
      <article><strong>30 + 30</strong><span>locals and college students</span></article>
      <article><strong>$1</strong><span>marginal cost per ticket sold</span></article>
      <article><strong>3</strong><span>price attempts each month</span></article>
    </section>

    <section class="card briefing-card">
      <span class="step-kicker">Your task</span>
      <h2>Find the ticket price that produces the most profit.</h2>
      <p>You know the size of each group, but not what anyone is willing to pay. The theater pays a $1 marginal cost for each additional ticket it sells. Enter one whole-dollar price from $1 through $10. After each attempt, the box office will report how many tickets sell and how much profit the theater earns.</p>
      <div class="formula-box">Profit = ticket revenue − ($1 marginal cost × tickets sold)</div>
      <button class="button button--primary button--wide" type="button" data-action="begin-august">Open the August box office</button>
    </section>
  `, { activeStep: "august" });
}

function priceField(id, label) {
  return `
    <label class="field" for="${id}">
      <span>${label}</span>
      <span class="money-input"><span aria-hidden="true">$</span><input id="${id}" type="number" inputmode="numeric" min="${MIN_PRICE}" max="${MAX_PRICE}" step="1" required></span>
    </label>
  `;
}

function renderMetric(label, value, emphasis = false) {
  return `<div class="result-metric ${emphasis ? "result-metric--accent" : ""}"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderLatestOutcome(roundId, outcome) {
  if (!outcome) {
    return `
      <div class="empty-state">
        <strong>Waiting for attempt 1</strong>
        <span>Your box-office results will appear here.</span>
      </div>
    `;
  }
  const salesDetail = roundId === "october"
    ? `${outcome.localQuantity} local · ${outcome.studentQuantity} student`
    : `${outcome.totalQuantity}`;
  return `
    <div class="latest-result" aria-live="polite">
      <span class="eyebrow">Attempt ${state.attempts[roundId].length} result</span>
      <div class="result-metrics">
        ${renderMetric("Tickets sold", salesDetail, true)}
        ${renderMetric("Seats empty", outcome.seatsEmpty)}
        ${renderMetric("Revenue", money(outcome.revenue))}
        ${renderMetric("Total marginal cost", money(outcome.cost))}
        ${renderMetric("Profit", money(outcome.profit), true)}
      </div>
      <p class="calculation-line">${money(outcome.revenue)} revenue − ${money(outcome.cost)} total marginal cost = <strong>${money(outcome.profit)} profit</strong></p>
    </div>
  `;
}

function attemptTable(roundId, attempts) {
  if (attempts.length === 0) {
    return "";
  }
  const isOctober = roundId === "october";
  const header = isOctober
    ? "<tr><th>Try</th><th>Local P</th><th>Student P</th><th>Local Q</th><th>Student Q</th><th>Total Q</th><th>Profit</th></tr>"
    : "<tr><th>Try</th><th>Price</th><th>Tickets</th><th>Empty</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr>";
  const rows = attempts.map((attempt, index) => isOctober
    ? `<tr><td>${index + 1}</td><td>${money(attempt.localPrice)}</td><td>${money(attempt.studentPrice)}</td><td>${attempt.localQuantity}</td><td>${attempt.studentQuantity}</td><td>${attempt.totalQuantity}</td><td><strong>${money(attempt.profit)}</strong></td></tr>`
    : `<tr><td>${index + 1}</td><td>${money(attempt.price)}</td><td>${attempt.totalQuantity}</td><td>${attempt.seatsEmpty}</td><td>${money(attempt.revenue)}</td><td>${money(attempt.cost)}</td><td><strong>${money(attempt.profit)}</strong></td></tr>`,
  ).join("");
  return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${rows}</tbody></table></div>`;
}

function roundCopy(roundId) {
  if (roundId === "august") {
    return {
      eyebrow: "August · Locals only",
      title: "Choose one ticket price",
      description: "Only 30 locals are in town. The theater has 60 seats.",
    };
  }
  if (roundId === "september") {
    return {
      eyebrow: "September · College is in session",
      title: "Choose one price for everyone",
      description: "All 30 locals and 30 college students are in town, but everyone must be charged the same price.",
    };
  }
  return {
    eyebrow: "October · Verified student pricing",
    title: "Choose a local price and a student price",
    description: "Student IDs are checked and tickets are nontransferable. You may try any two whole-dollar prices.",
  };
}

function renderPlayRound(roundId) {
  const attempts = state.attempts[roundId];
  const count = attempts.length;
  const complete = count === ATTEMPTS_PER_ROUND;
  const latest = count > 0 ? attempts[count - 1] : null;
  const copy = roundCopy(roundId);
  const formId = roundId === "october" ? "segmented-form" : "uniform-form";
  const fields = roundId === "october"
    ? `<div class="field-grid field-grid--two">${priceField("local-price", "Price for locals")}${priceField("student-price", "Price for college students")}</div>`
    : priceField("uniform-price", "Ticket price");
  app.innerHTML = pageShell(`
    <section class="phase-heading">
      <div>
        <span class="eyebrow">${copy.eyebrow}</span>
        <h1>${copy.title}</h1>
        <p>${copy.description}</p>
      </div>
      <div class="attempt-count"><strong>${count}</strong><span>of ${ATTEMPTS_PER_ROUND}<br>attempts</span></div>
    </section>

    <div class="play-layout">
      <section class="card decision-card">
        ${complete
          ? `<span class="step-kicker">Round complete</span><h2>All three prices are recorded.</h2><p>Review your evidence, then see how your group did.</p><button class="button button--primary button--wide" type="button" data-action="review-${roundId}">Review ${ROUNDS[roundId].label}</button>`
          : `<span class="step-kicker">Attempt ${count + 1}</span><h2>What should the spokesperson enter?</h2><p>Whole-dollar prices from $1 through $10 are allowed.</p><form id="${formId}" data-round="${roundId}" novalidate>${fields}<div id="form-error" class="form-error" role="alert"></div><button class="button button--primary button--wide" type="submit">Set ${roundId === "october" ? "prices" : "price"} and see results</button></form>`
        }
      </section>
      <section class="card result-card">
        ${renderLatestOutcome(roundId, latest)}
      </section>
    </div>

    ${count > 0 ? `
      <section class="card history-card">
        <div class="card-heading-row">
          <div><span class="eyebrow">Evidence so far</span><h2>Your ${ROUNDS[roundId].label} attempts</h2></div>
        </div>
        ${attemptTable(roundId, attempts)}
      </section>
    ` : ""}
  `, { activeStep: roundId });
}

function directionLabel(direction) {
  return { increase: "Increase", decrease: "Decrease", same: "Stay the same" }[direction] ?? "Not answered";
}

function predictionCard(roundId, { resolved = false } = {}) {
  const prediction = state.predictions[roundId];
  const answers = roundId === "september"
    ? { profit: "same", quantity: "same" }
    : { profit: "increase", quantity: "increase" };
  return `
    <section class="prediction-receipt ${resolved ? "prediction-receipt--resolved" : ""}">
      <span class="eyebrow">Your ${ROUNDS[roundId].label} prediction${resolved ? " · resolved" : " · saved"}</span>
      <div>
        <p><strong>Maximum profit:</strong> ${directionLabel(prediction.profit)}${resolved ? ` <span class="answer-tag">Answer: ${directionLabel(answers.profit)}</span>` : ""}</p>
        <p><strong>Tickets sold at the best price:</strong> ${directionLabel(prediction.quantity)}${resolved ? ` <span class="answer-tag">Answer: ${directionLabel(answers.quantity)}</span>` : ""}</p>
      </div>
    </section>
  `;
}

function bestResultCard(roundId, attempt) {
  if (!attempt) {
    return `<article class="best-card"><span>${ROUNDS[roundId].label}</span><strong>No result</strong></article>`;
  }
  const priceText = roundId === "october"
    ? `${money(attempt.localPrice)} local · ${money(attempt.studentPrice)} student`
    : `${money(attempt.price)} ticket price`;
  return `
    <article class="best-card">
      <span>${ROUNDS[roundId].label}</span>
      <strong>${money(attempt.profit)} profit</strong>
      <p>${priceText}<br>${attempt.totalQuantity} sold · ${attempt.seatsEmpty} empty</p>
    </article>
  `;
}

function renderReview(roundId) {
  const attempts = state.attempts[roundId];
  const best = bestAttempt(attempts);
  const priorIds = roundId === "august" ? [] : roundId === "september" ? ["august"] : ["august", "september"];
  const nextAction = {
    august: ["predict-september", "September: students return"],
    september: ["predict-october", "October: add student pricing"],
    october: ["open-recap", "Recap the exercise"],
  }[roundId];
  const comparison = priorIds.length === 0 ? "" : `
    <section class="comparison-strip" aria-label="Comparison with earlier attempts">
      ${priorIds.map((priorId) => {
        const prior = bestAttempt(state.attempts[priorId]);
        return `<div><span>Compared with your ${ROUNDS[priorId].label} best</span><strong>${signedMoney(best.profit - prior.profit)} profit</strong><small>${best.totalQuantity - prior.totalQuantity >= 0 ? "+" : "−"}${Math.abs(best.totalQuantity - prior.totalQuantity)} tickets</small></div>`;
      }).join("")}
    </section>
  `;
  app.innerHTML = pageShell(`
    <section class="review-hero">
      <span class="eyebrow">${ROUNDS[roundId].label} review</span>
      <h1>Your room’s best result was ${money(best.profit)}.</h1>
      <p class="lede">This is your group’s result—not the answer key. The true maximum stays hidden until the final summary.</p>
    </section>
    <section class="best-grid best-grid--review">
      ${bestResultCard(roundId, best)}
    </section>
    ${comparison}
    ${roundId === "august" ? "" : predictionCard(roundId)}
    <section class="card review-table">
      <div class="card-heading-row"><div><span class="eyebrow">All three shots</span><h2>${ROUNDS[roundId].label} results</h2></div></div>
      ${attemptTable(roundId, attempts)}
    </section>
    <div class="next-panel">
      <p>Ready for the next part?</p>
      <button class="button button--primary" type="button" data-action="${nextAction[0]}">${nextAction[1]} →</button>
    </div>
  `, { activeStep: roundId });
}

function predictionButtons(roundId, kind) {
  const selected = state.predictions[roundId][kind];
  return `
    <div class="prediction-options" role="group" aria-label="${kind === "profit" ? "Maximum profit" : "Tickets sold"} prediction">
      ${DIRECTIONS.map((direction) => `
        <button class="prediction-button ${selected === direction ? "is-selected" : ""}" type="button" data-prediction-round="${roundId}" data-prediction-kind="${kind}" data-direction="${direction}" aria-pressed="${selected === direction}">
          ${directionLabel(direction)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderPrediction(roundId) {
  const isSeptember = roundId === "september";
  const prediction = state.predictions[roundId];
  const complete = prediction.profit && prediction.quantity;
  app.innerHTML = pageShell(`
    <section class="prediction-hero">
      <span class="eyebrow">${ROUNDS[roundId].label} · Before setting prices</span>
      <h1>${isSeptember ? "The college students are back." : "The theater can now offer student pricing."}</h1>
      <p class="lede">${isSeptember
        ? "All 60 consumers are now in town, but the theater must still charge everyone the same price."
        : "The theater may independently choose one price for locals and another for college students. Student IDs are checked, and tickets cannot be transferred."}</p>
    </section>

    <section class="prediction-card">
      <span class="step-kicker">Predict together</span>
      <div class="prediction-question">
        <h2>Compared with ${isSeptember ? "August" : "September"}, what will happen to the maximum possible profit?</h2>
        ${predictionButtons(roundId, "profit")}
      </div>
      <div class="prediction-question">
        <h2>At the profit-maximizing price${isSeptember ? "" : "s"}, what will happen to the number of tickets sold?</h2>
        ${predictionButtons(roundId, "quantity")}
      </div>
      <p class="prediction-note">The answers stay hidden until the final summary.</p>
      <button class="button button--primary button--wide" type="button" data-action="begin-${roundId}" ${complete ? "" : "disabled"}>Lock in the prediction and set prices</button>
    </section>
  `, { activeStep: roundId, narrow: true });
}

function renderRecap() {
  const bests = Object.fromEntries(Object.keys(ROUNDS).map((roundId) => [roundId, bestAttempt(state.attempts[roundId])]));
  app.innerHTML = pageShell(`
    <section class="recap-hero">
      <span class="eyebrow">Your group’s exercise</span>
      <h1>Three months at the box office</h1>
      <p class="lede">These are your room’s best attempts. The market values and profit-maximizing choices are still hidden.</p>
    </section>
    <section class="best-grid">
      ${Object.keys(ROUNDS).map((roundId) => bestResultCard(roundId, bests[roundId])).join("")}
    </section>
    <div class="prediction-grid">
      ${predictionCard("september")}
      ${predictionCard("october")}
    </div>
    <section class="recap-actions">
      <div><span class="eyebrow">Try again</span><h2>Want another shot?</h2><p>This clears the room’s choices and returns to the screen-sharing button.</p><button class="button button--secondary" type="button" data-action="replay">Redo the exercise</button></div>
      <div><span class="eyebrow">Reveal</span><h2>Ready to see the market?</h2><p>Open the willingness-to-pay values, optimal choices, and profit charts.</p><button class="button button--primary" type="button" data-action="open-summary">Continue to final summary →</button></div>
    </section>
  `, { activeStep: "recap", showReset: false });
}

function metricList(outcome) {
  return `
    <dl>
      <div><dt>Tickets sold</dt><dd>${outcome.totalQuantity}</dd></div>
      <div><dt>Seats empty</dt><dd>${outcome.seatsEmpty}</dd></div>
      <div><dt>Revenue</dt><dd>${money(outcome.revenue)}</dd></div>
      <div><dt>Cost</dt><dd>${money(outcome.cost)}</dd></div>
      <div><dt>Profit</dt><dd>${money(outcome.profit)}</dd></div>
    </dl>
  `;
}

function benchmarkCard(roundId) {
  const benchmark = BENCHMARKS[roundId];
  const prices = roundId === "october"
    ? `${money(benchmark.localPrice)} locals · ${money(benchmark.studentPrice)} students`
    : `${money(benchmark.price)} for everyone`;
  return `
    <article class="benchmark-card ${roundId === "october" ? "benchmark-card--accent" : ""}">
      <span>${ROUNDS[roundId].label}</span>
      <h3>${prices}</h3>
      ${metricList(benchmark)}
    </article>
  `;
}

function uniformProfitChart() {
  const august = uniformProfitSchedule("august");
  const september = uniformProfitSchedule("september");
  const width = 900;
  const height = 350;
  const left = 56;
  const baseline = 285;
  const plotHeight = 245;
  const scale = plotHeight / 210;
  const groupWidth = 80;
  const grid = [0, 50, 100, 150, 200].map((value) => {
    const y = baseline - value * scale;
    return `<line class="chart-gridline" x1="${left}" y1="${y}" x2="870" y2="${y}"></line><text class="chart-axis-label" x="48" y="${y + 4}" text-anchor="end">$${value}</text>`;
  }).join("");
  const bars = august.map((augustOutcome, index) => {
    const septemberOutcome = september[index];
    const x = left + index * groupWidth + 10;
    const augustHeight = augustOutcome.profit * scale;
    const septemberHeight = septemberOutcome.profit * scale;
    return `
      <rect class="chart-bar chart-bar--august" x="${x}" y="${baseline - augustHeight}" width="26" height="${augustHeight}"><title>August, $${augustOutcome.price} price: $${augustOutcome.profit} profit</title></rect>
      <rect class="chart-bar chart-bar--september" x="${x + 29}" y="${baseline - septemberHeight}" width="26" height="${septemberHeight}"><title>September, $${septemberOutcome.price} price: $${septemberOutcome.profit} profit</title></rect>
      <text class="chart-price-label" x="${x + 27}" y="308" text-anchor="middle">$${augustOutcome.price}</text>
    `;
  }).join("");
  const rows = august.map((outcome, index) => `<tr><td>${money(outcome.price)}</td><td>${money(outcome.profit)}</td><td>${money(september[index].profit)}</td></tr>`).join("");
  return `
    <section class="chart-card">
      <div class="chart-heading"><div><span class="eyebrow">One price</span><h2>Profit at every uniform ticket price</h2></div><div class="chart-legend"><span><i class="legend-august"></i>August</span><span><i class="legend-september"></i>September</span></div></div>
      <div class="chart-scroll"><svg class="profit-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="uniform-chart-title uniform-chart-desc"><title id="uniform-chart-title">August and September profit by ticket price</title><desc id="uniform-chart-desc">The maximum profit in both months is 210 dollars at an 8 dollar price, even though college students return in September.</desc>${grid}${bars}<text class="chart-axis-title" x="460" y="338" text-anchor="middle">Uniform ticket price</text></svg></div>
      <details class="chart-data"><summary>View the chart values as a table</summary><div class="table-wrap"><table><thead><tr><th>Price</th><th>August profit</th><th>September profit</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    </section>
  `;
}

function marketProfitChart(marketId) {
  const schedule = marketProfitSchedule(marketId);
  const label = MARKETS[marketId].label;
  const width = 480;
  const baseline = 255;
  const plotHeight = 215;
  const scale = plotHeight / 210;
  const bars = schedule.map((outcome, index) => {
    const x = 46 + index * 42;
    const barHeight = outcome.profit * scale;
    return `<rect class="chart-bar chart-bar--${marketId}" x="${x}" y="${baseline - barHeight}" width="28" height="${barHeight}"><title>${label}, $${outcome.price} price: $${outcome.profit} profit contribution</title></rect><text class="chart-price-label" x="${x + 14}" y="277" text-anchor="middle">$${outcome.price}</text>`;
  }).join("");
  const rows = schedule.map((outcome) => `<tr><td>${money(outcome.price)}</td><td>${outcome.quantity}</td><td>${money(outcome.profit)}</td></tr>`).join("");
  return `
    <article class="market-chart">
      <span class="eyebrow">${label}</span>
      <h3>Profit contribution by price</h3>
      <div class="chart-scroll"><svg class="profit-chart profit-chart--small" viewBox="0 0 ${width} 310" role="img" aria-label="${label} profit contribution at each price"><line class="chart-gridline" x1="38" y1="255" x2="466" y2="255"></line>${bars}<text class="chart-axis-title" x="250" y="304" text-anchor="middle">Price for ${marketId}</text></svg></div>
      <details class="chart-data"><summary>View values</summary><div class="table-wrap"><table><thead><tr><th>Price</th><th>Tickets</th><th>Profit</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    </article>
  `;
}

const DISCUSSION_QUESTIONS = [
  "Why would a theater choose a price that leaves some seats empty?",
  "Why does the theater ignore students when they arrive back on campus?",
  "What would happen here if the students could buy tickets at a discount and then re-sell them to locals?",
];

function renderSummary() {
  app.innerHTML = pageShell(`
    <section class="summary-hero">
      <span class="eyebrow">The full market revealed</span>
      <h1>What was hiding behind the box office?</h1>
      <p class="lede">Each person buys one ticket when the price is no higher than their willingness to pay.</p>
    </section>

    <section class="market-reveal" aria-labelledby="market-values-heading">
      <div><span class="step-kicker">Market values</span><h2 id="market-values-heading">The most each person would pay</h2></div>
      <article><h3>30 locals</h3><div class="value-groups"><span><strong>$10</strong> × 10 people</span><span><strong>$9</strong> × 10 people</span><span><strong>$8</strong> × 10 people</span></div></article>
      <article><h3>30 college students</h3><div class="value-groups"><span><strong>$6</strong> × 10 people</span><span><strong>$5</strong> × 10 people</span><span><strong>$4</strong> × 10 people</span></div></article>
      <p class="formula-note">The theater has ${CAPACITY} seats and pays a ${money(MARGINAL_COST)} marginal cost for each ticket sold.</p>
    </section>

    <section class="benchmark-section">
      <div class="section-heading"><span class="step-kicker">Profit-maximizing choices</span><div><h2>The economic answer</h2><p>These are the best outcomes among all permitted whole-dollar prices.</p></div></div>
      <div class="benchmark-grid">${Object.keys(ROUNDS).map(benchmarkCard).join("")}</div>
    </section>

    <section class="resolved-predictions">
      <div class="section-heading"><span class="step-kicker">Predictions</span><div><h2>What actually changes?</h2></div></div>
      <div class="prediction-grid">${predictionCard("september", { resolved: true })}${predictionCard("october", { resolved: true })}</div>
    </section>

    ${uniformProfitChart()}

    <section class="october-charts">
      <div class="section-heading"><span class="step-kicker">Two prices</span><div><h2>October profit separates into two parts</h2><p>Choose the best local contribution and the best student contribution, then add them: $210 + $90 = $300.</p></div></div>
      <div class="market-chart-grid">${marketProfitChart("locals")}${marketProfitChart("students")}</div>
    </section>

    <section class="discussion-section">
      <span class="eyebrow">Breakout discussion</span>
      <h1>In the time remaining, discuss the following questions.</h1>
      <ol class="question-list">${DISCUSSION_QUESTIONS.map((question, index) => `<li><span>0${index + 1}</span><h2>${question}</h2></li>`).join("")}</ol>
    </section>
  `, { activeStep: "summary" });
}

function showFormError(message) {
  const error = document.querySelector("#form-error");
  if (error) {
    error.textContent = message;
  }
}

function numberFrom(selector) {
  const field = document.querySelector(selector);
  return field?.value === "" ? Number.NaN : Number(field?.value);
}

function saveAttempt(roundId, attempt) {
  if (state.attempts[roundId].length >= ATTEMPTS_PER_ROUND) {
    return;
  }
  updateState({
    attempts: {
      ...state.attempts,
      [roundId]: [...state.attempts[roundId], attempt],
    },
  });
}

function submitUniformAttempt(roundId) {
  const price = numberFrom("#uniform-price");
  try {
    saveAttempt(roundId, uniformOutcome(roundId, price));
  } catch {
    showFormError(`Enter a whole-dollar price from ${money(MIN_PRICE)} through ${money(MAX_PRICE)}.`);
  }
}

function submitSegmentedAttempt() {
  const localPrice = numberFrom("#local-price");
  const studentPrice = numberFrom("#student-price");
  try {
    saveAttempt("october", segmentedOutcome(localPrice, studentPrice));
  } catch {
    showFormError(`Enter two whole-dollar prices from ${money(MIN_PRICE)} through ${money(MAX_PRICE)}.`);
  }
}

function handlePrediction(button) {
  const roundId = button.dataset.predictionRound;
  const kind = button.dataset.predictionKind;
  const direction = button.dataset.direction;
  if (!["september", "october"].includes(roundId) || !["profit", "quantity"].includes(kind) || !DIRECTIONS.includes(direction)) {
    return;
  }
  updateState({
    predictions: {
      ...state.predictions,
      [roundId]: { ...state.predictions[roundId], [kind]: direction },
    },
  });
}

function handleClick(event) {
  const predictionButton = event.target.closest("[data-prediction-round]");
  if (predictionButton) {
    handlePrediction(predictionButton);
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const phaseActions = {
    start: "setup-august",
    "begin-august": "play-august",
    "review-august": "review-august",
    "predict-september": "predict-september",
    "begin-september": "play-september",
    "review-september": "review-september",
    "predict-october": "predict-october",
    "begin-october": "play-october",
    "review-october": "review-october",
    "open-recap": "recap",
    "open-summary": "summary",
  };
  if (action === "ack-share") {
    updateState({ shareAcknowledged: true });
  } else if (action === "reset" || action === "replay") {
    resetActivity(true);
  } else if (phaseActions[action]) {
    setPhase(phaseActions[action]);
  }
}

function handleSubmit(event) {
  event.preventDefault();
  if (event.target.id === "uniform-form") {
    submitUniformAttempt(event.target.dataset.round);
  } else if (event.target.id === "segmented-form") {
    submitSegmentedAttempt();
  }
}

function render() {
  switch (state.phase) {
    case "share": renderShareGate(); break;
    case "setup-august": renderAugustSetup(); break;
    case "play-august": renderPlayRound("august"); break;
    case "review-august": renderReview("august"); break;
    case "predict-september": renderPrediction("september"); break;
    case "play-september": renderPlayRound("september"); break;
    case "review-september": renderReview("september"); break;
    case "predict-october": renderPrediction("october"); break;
    case "play-october": renderPlayRound("october"); break;
    case "review-october": renderReview("october"); break;
    case "recap": renderRecap(); break;
    case "summary": renderSummary(); break;
    default: renderShareGate();
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

app.addEventListener("click", handleClick);
app.addEventListener("submit", handleSubmit);
render();
