/**
 * Renders the role-specific student experience and manages one device's local session.
 * All coordination happens aloud in Zoom; this script never sends data over the network.
 */

const {
  ATTEMPTS_PER_TREATMENT,
  BENCHMARKS,
  MARKETS,
  bestAttempt,
  demandAtPrice,
  makeGroupAttempt,
  makeInitialState,
  makeUniformAttempt,
  normalizeStoredState,
  roleForState,
  rolesForGroup,
  validateGroupReport,
  validateUniformReport,
} = globalThis.TwoMarketsGameLogic;

const STORAGE_KEY = "movie-ticket-pricing-challenge-state-v3";
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

function setState(changes) {
  state = normalizeStoredState({ ...state, ...changes });
  persistState();
  render();
}

function resetActivity() {
  const hasProgress = state.uniformAttempts.length || state.groupAttempts.length;
  if (
    hasProgress &&
    !window.confirm("Start over on this device? Your saved role and game attempts will be erased.")
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

function storageNotice() {
  if (storageAvailable) {
    return "";
  }
  return `
    <div class="notice notice--warning" role="status">
      <strong>Refresh recovery is unavailable.</strong>
      You can keep playing, but leave this tab open because this browser is blocking local storage.
    </div>
  `;
}

function progressSteps(activeStep) {
  const steps = [
    ["uniform", "1", "One price"],
    ["group", "2", "Student price"],
    ["reveal", "3", "Reveal"],
    ["discussion", "4", "Discuss"],
  ];
  const activeIndex = steps.findIndex(([id]) => id === activeStep);
  return `
    <ol class="progress" aria-label="Game progress">
      ${steps
        .map(([id, number, label], index) => {
          const status = index < activeIndex ? "is-complete" : index === activeIndex ? "is-active" : "";
          const current = index === activeIndex ? ' aria-current="step"' : "";
          return `<li class="${status}"${current}><span>${number}</span>${label}</li>`;
        })
        .join("")}
    </ol>
  `;
}

function spokespersonProgress(activeStep) {
  return progressSteps(activeStep);
}

function pageShell(content, options = {}) {
  const { narrow = false, showReset = true } = options;
  return `
    <div class="page-shell ${narrow ? "page-shell--narrow" : ""}">
      ${storageNotice()}
      ${content}
      ${
        showReset
          ? `<div class="utility-row"><button class="button button--text" type="button" data-action="reset">Start over on this device</button></div>`
          : ""
      }
    </div>
  `;
}

function renderLanding() {
  app.innerHTML = pageShell(
    `
      <section class="hero hero--cinema">
        <div class="hero__copy">
          <span class="eyebrow">Tonight’s screening · six pricing decisions</span>
          <h1>What should the theater charge for a movie ticket?</h1>
          <p class="lede">
            This exercise is about a neighborhood movie theater. First, the theater will sell
            the same ticket to everyone. Second, the theater will try a student discount. Talk
            through this exercise together—the website does not connect your devices.
          </p>
        </div>
        <figure class="hero-product">
          <img src="assets/movie-ticket-hero.jpg" alt="Two blank movie tickets beside popcorn in a theater.">
          <figcaption>One Screening. Six seats. What price is best?</figcaption>
        </figure>
      </section>

      <section class="choice-panel" aria-labelledby="group-size-heading">
        <div class="section-heading">
          <span class="step-kicker">First</span>
          <div>
            <h2 id="group-size-heading">How many people are in your breakout room?</h2>
            <p>Everyone in the room should choose the same number.</p>
          </div>
        </div>
        <div class="size-grid">
          <button class="size-card" type="button" data-group-size="3">
            <span class="size-card__number">3</span>
            <span><strong>Three people</strong><small>Spokesperson + two customer groups</small></span>
            <span class="size-card__arrow" aria-hidden="true">→</span>
          </button>
          <button class="size-card" type="button" data-group-size="4">
            <span class="size-card__number">4</span>
            <span><strong>Four people</strong><small>Spokesperson + manager + two customer groups</small></span>
            <span class="size-card__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section class="privacy-note">
        <span aria-hidden="true">●</span>
        <p><strong>Nothing is submitted.</strong> Your choices stay on this device and only help recover from an accidental refresh.</p>
      </section>
    `,
    { showReset: false },
  );
}

function renderRoleSelection() {
  const roles = rolesForGroup(state.groupSize);
  app.innerHTML = pageShell(`
    <button class="back-link" type="button" data-action="change-size">← Change group size</button>
    <section class="role-intro">
      <span class="eyebrow">Group of ${state.groupSize}</span>
      <h1>Choose a spokesperson first</h1>
      <p class="lede">The spokesperson assigns every other role aloud. Then each person opens the role they were assigned.</p>
    </section>
    <div class="role-grid role-grid--${state.groupSize}">
      ${roles
        .map(
          (role, index) => `
            <button class="role-card role-card--${index + 1}" type="button" data-role="${role.id}">
              <span class="role-card__index">0${index + 1}</span>
              <span class="role-card__body">
                <strong>${role.title}</strong>
                <small>${role.subtitle}</small>
              </span>
              ${role.isSpokesperson ? '<span class="role-card__badge">Choose first</span>' : ""}
              <span class="role-card__arrow" aria-hidden="true">→</span>
            </button>
          `,
        )
        .join("")}
    </div>
    <div class="notice">
      <strong>Privacy matters:</strong> only customer representatives should open customer roles.
      The theater should not see willingness to pay until the reveal.
    </div>
  `);
}

function renderSpokespersonSetup(role) {
  const isCombined = role.id === "combined-controller";
  app.innerHTML = pageShell(
    `
      <section class="role-banner role-banner--spokesperson">
        <span class="role-banner__label">Your role</span>
        <h1>${role.title}</h1>
        <p>${
          isCombined
            ? "You assign the other roles, choose every ticket price, record both groups’ sales, and speak for your room afterward."
            : "You assign the other roles, ask the theater manager for each price, record both groups’ sales, and speak for your room afterward."
        }</p>
      </section>

      <section class="card setup-card" aria-labelledby="ready-heading">
        <div class="section-heading">
          <span class="step-kicker">Before you start</span>
          <div>
            <h2 id="ready-heading">Get everyone ready</h2>
            <p>Assign each remaining role aloud. Begin when every student has the assigned role open.</p>
          </div>
        </div>
        <ol class="checklist">
          ${
            isCombined
              ? ""
              : "<li>Confirm that one person is the theater manager and will choose ticket prices.</li>"
          }
          <li>Confirm that one person represents local movie fans.</li>
          <li>Confirm that one person represents verified students.</li>
          <li>Tell both groups to keep willingness to pay private.</li>
        </ol>
        <div class="read-aloud">
          <span>Read aloud</span>
          “We will try three ticket prices under each pricing system. Tell me only how many people buy—not what they would pay.”
        </div>
        <button class="button button--primary button--wide" type="button" data-action="start-game">
          Everyone is ready — sell tickets
        </button>
      </section>
    `,
    { narrow: true },
  );
}

function renderAttemptTable(type, attempts) {
  if (attempts.length === 0) {
    return `<div class="empty-state">No attempts recorded yet.</div>`;
  }

  const header = type === "uniform"
    ? "<tr><th>Try</th><th>Price</th><th>High Q</th><th>Low Q</th><th>Total Q</th><th>Profit</th></tr>"
    : "<tr><th>Try</th><th>High P</th><th>Low P</th><th>High Q</th><th>Low Q</th><th>Profit</th></tr>";
  const rows = attempts
    .map((attempt, index) => {
      if (type === "uniform") {
        return `<tr><td>${index + 1}</td><td>${money(attempt.price)}</td><td>${attempt.highQuantity}</td><td>${attempt.lowQuantity}</td><td>${attempt.totalQuantity}</td><td><strong>${money(attempt.profit)}</strong></td></tr>`;
      }
      return `<tr><td>${index + 1}</td><td>${money(attempt.highPrice)}</td><td>${money(attempt.lowPrice)}</td><td>${attempt.highQuantity}</td><td>${attempt.lowQuantity}</td><td><strong>${money(attempt.profit)}</strong></td></tr>`;
    })
    .join("");

  return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${rows}</tbody></table></div>`;
}

function quantitySelect(id, fieldLabel) {
  return `
    <label class="field">
      <span>${fieldLabel}</span>
      <select id="${id}" required>
        <option value="">Choose 0–3</option>
        <option value="0">0 customers</option>
        <option value="1">1 customer</option>
        <option value="2">2 customers</option>
        <option value="3">3 customers</option>
      </select>
    </label>
  `;
}

function renderUniformPhase() {
  const count = state.uniformAttempts.length;
  const complete = count === ATTEMPTS_PER_TREATMENT;
  app.innerHTML = pageShell(`
    ${spokespersonProgress("uniform")}
    <section class="phase-heading">
      <div>
        <span class="eyebrow">Treatment 1 of 2</span>
        <h1>One ticket price for everyone</h1>
        <p>The theater must offer the same general-admission price to movie fans and students.</p>
      </div>
      <div class="attempt-count"><strong>${count}</strong><span>of 3<br>attempts</span></div>
    </section>

    <div class="game-layout">
      <section class="card">
        <h2>${complete ? "All three attempts are recorded" : `Record attempt ${count + 1}`}</h2>
        ${
          complete
            ? `<p>Compare the profits, then continue when the group is ready.</p>
               <button class="button button--primary button--wide" type="button" data-action="next-group">Add a verified student price →</button>`
            : `<p class="form-instruction">${
                state.groupSize === 4
                  ? "Ask the theater manager for one ticket price. Announce it to both groups, then record sales."
                  : "Choose one ticket price. Announce it to both groups, then record sales."
              }</p>
              <form id="uniform-form" novalidate>
                <div class="field-grid field-grid--three">
                  <label class="field">
                    <span>General-admission ticket price</span>
                    <span class="money-input"><span>$</span><input id="uniform-price" type="number" inputmode="numeric" min="1" max="10" step="1" required></span>
                  </label>
                  ${quantitySelect("uniform-high-quantity", "Movie-fan tickets sold")}
                  ${quantitySelect("uniform-low-quantity", "Student tickets sold")}
                </div>
                <div id="form-error" class="form-error" role="alert"></div>
                <button class="button button--primary button--wide" type="submit">Check and record attempt ${count + 1}</button>
              </form>`
        }
      </section>

      <section class="card results-card">
        <div class="card-heading-row"><h2>Your results</h2>${
          count > 0
            ? '<button class="button button--small button--secondary" type="button" data-action="remove-uniform">Correct latest</button>'
            : ""
        }</div>
        ${renderAttemptTable("uniform", state.uniformAttempts)}
        <p class="formula-note">Ticket profit = (price − $1 per-attendee cost) × tickets sold</p>
      </section>
    </div>
  `);
}

function renderGroupPhase() {
  const count = state.groupAttempts.length;
  const complete = count === ATTEMPTS_PER_TREATMENT;
  app.innerHTML = pageShell(`
    ${spokespersonProgress("group")}
    <section class="phase-heading">
      <div>
        <span class="eyebrow">Treatment 2 of 2</span>
        <h1>Add a verified student price</h1>
        <p>Student ID is checked at the door, so the discounted ticket cannot be used by general-admission customers.</p>
      </div>
      <div class="attempt-count"><strong>${count}</strong><span>of 3<br>attempts</span></div>
    </section>

    <div class="game-layout">
      <section class="card">
        <h2>${complete ? "All three attempts are recorded" : `Record attempt ${count + 1}`}</h2>
        ${
          complete
            ? `<p>Compare these profits with the one-price results, then reveal the economics.</p>
               <button class="button button--primary button--wide" type="button" data-action="next-reveal">Reveal the market →</button>`
            : `<p class="form-instruction">${
                state.groupSize === 4
                  ? "Ask the theater manager for both ticket prices. Tell each group only its price."
                  : "Choose both ticket prices. Tell each group only its price."
              }</p>
              <form id="group-form" novalidate>
                <div class="market-form-grid">
                  <fieldset>
                    <legend>General admission</legend>
                    <label class="field">
                      <span>Price</span>
                      <span class="money-input"><span>$</span><input id="group-high-price" type="number" inputmode="numeric" min="1" max="10" step="1" required></span>
                    </label>
                    ${quantitySelect("group-high-quantity", "Movie-fan tickets sold")}
                  </fieldset>
                  <fieldset>
                    <legend>Verified students</legend>
                    <label class="field">
                      <span>Price</span>
                      <span class="money-input"><span>$</span><input id="group-low-price" type="number" inputmode="numeric" min="1" max="10" step="1" required></span>
                    </label>
                    ${quantitySelect("group-low-quantity", "Student tickets sold")}
                  </fieldset>
                </div>
                <div id="form-error" class="form-error" role="alert"></div>
                <button class="button button--primary button--wide" type="submit">Check and record attempt ${count + 1}</button>
              </form>`
        }
      </section>

      <section class="card results-card">
        <div class="card-heading-row"><h2>Your results</h2>${
          count > 0
            ? '<button class="button button--small button--secondary" type="button" data-action="remove-group">Correct latest</button>'
            : ""
        }</div>
        ${renderAttemptTable("group", state.groupAttempts)}
        <p class="formula-note">Profit = each ticket type’s (price − $1 per-attendee cost) × tickets sold</p>
      </section>
    </div>
  `);
}

function bestUniformSummary(attempt) {
  return attempt
    ? `<strong>${money(attempt.profit)} profit</strong><span>${money(attempt.price)} price · ${attempt.totalQuantity} sold</span>`
    : "<strong>Not recorded</strong>";
}

function bestGroupSummary(attempt) {
  return attempt
    ? `<strong>${money(attempt.profit)} profit</strong><span>${money(attempt.highPrice)} high · ${money(attempt.lowPrice)} low · ${attempt.totalQuantity} sold</span>`
    : "<strong>Not recorded</strong>";
}

function renderReveal() {
  const roomUniform = bestAttempt(state.uniformAttempts);
  const roomGroup = bestAttempt(state.groupAttempts);
  app.innerHTML = pageShell(`
    ${spokespersonProgress("reveal")}
    <section class="reveal-hero">
      <span class="eyebrow">The box office revealed</span>
      <h1>Compare the box-office results before judging them.</h1>
      <p class="lede">Prices, ticket sales, and profit appear now. Consumer surplus and total surplus stay hidden until your group works through the discussion.</p>
    </section>

    <section class="room-result" aria-labelledby="room-result-heading">
      <h2 id="room-result-heading">Your room’s best attempts</h2>
      <div class="room-result__grid">
        <div><span>One ticket price</span>${bestUniformSummary(roomUniform)}</div>
        <div><span>Verified student pricing</span>${bestGroupSummary(roomGroup)}</div>
      </div>
    </section>

    <section class="comparison" aria-labelledby="benchmark-heading">
      <div class="section-heading section-heading--centered">
        <span class="step-kicker">Benchmark</span>
        <div><h2 id="benchmark-heading">Profit-maximizing outcomes</h2></div>
      </div>
      <div class="comparison__grid">
        <article class="benchmark-card">
          <span class="benchmark-card__tag">One ticket price</span>
          <h3>${money(BENCHMARKS.uniform.price)} general admission</h3>
          <div class="metric"><strong>${BENCHMARKS.uniform.totalQuantity}</strong><span>tickets sold<br>movie fans only</span></div>
          <dl>
            <div><dt>Theater profit</dt><dd>${money(BENCHMARKS.uniform.profit)}</dd></div>
          </dl>
        </article>
        <div class="comparison__arrow" aria-hidden="true">→</div>
        <article class="benchmark-card benchmark-card--accent">
          <span class="benchmark-card__tag">Verified student pricing</span>
          <h3>${money(BENCHMARKS.group.highPrice)} general · ${money(BENCHMARKS.group.lowPrice)} student</h3>
          <div class="metric"><strong>${BENCHMARKS.group.totalQuantity}</strong><span>tickets sold<br>all six seats filled</span></div>
          <dl>
            <div><dt>Theater profit</dt><dd>${money(BENCHMARKS.group.profit)}</dd></div>
          </dl>
        </article>
      </div>
    </section>

    <section class="values-reveal">
      <div>
        <span class="eyebrow">Now everyone may look</span>
        <h2>The most each person would pay</h2>
      </div>
      <div class="value-chips"><strong>Movie fans</strong>${MARKETS.high.values.map((value) => `<span>${money(value)}</span>`).join("")}</div>
      <div class="value-chips"><strong>Students</strong>${MARKETS.low.values.map((value) => `<span>${money(value)}</span>`).join("")}</div>
    </section>

    <div class="action-panel">
      <p><strong>Do not calculate alone.</strong> Read each question aloud and use the six willingness-to-pay values as evidence.</p>
      <button class="button button--primary" type="button" data-action="next-discussion">Open the discussion questions →</button>
    </div>
  `);
}

function discussionQuestionList() {
  return `
    <ol class="question-list">
      <li><span>01</span><div><h2>Why did the theater earn more by charging $8 and leaving three seats empty than by charging $4 and filling every seat?</h2></div></li>
      <li><span>02</span><div><h2>What would happen to the two-price strategy if the theater stopped checking student IDs or allowed tickets to be resold?</h2></div></li>
      <li><span>03</span><div><h2>When the $4 student ticket was introduced, whose surplus changed—and by how much? Where did the increase in total surplus come from?</h2></div></li>
      <li><span>04</span><div><h2>Now suppose the third movie fan would pay only $5 rather than $8. Recalculate the best one-price and student-pricing outcomes. Does student pricing still increase profit? Does it still increase total surplus?</h2></div></li>
    </ol>
  `;
}

function baselineFacts() {
  return `
    <section class="baseline-facts" aria-label="Facts available for discussion">
      <article><span>One ticket price</span><strong>$8</strong><p>3 tickets sold · $21 theater profit</p></article>
      <article><span>Student pricing</span><strong>$8 general · $4 student</strong><p>6 tickets sold · $30 theater profit</p></article>
    </section>
    <section class="values-reveal values-reveal--compact">
      <div><span class="eyebrow">Willingness to pay</span><h2>Use these values in Questions 3 and 4</h2></div>
      <div class="value-chips"><strong>Movie fans</strong>${MARKETS.high.values.map((value) => `<span>${money(value)}</span>`).join("")}</div>
      <div class="value-chips"><strong>Students</strong>${MARKETS.low.values.map((value) => `<span>${money(value)}</span>`).join("")}</div>
    </section>
  `;
}

function renderDiscussion() {
  app.innerHTML = pageShell(`
    ${spokespersonProgress("discussion")}
    <section class="discussion-hero">
      <span class="eyebrow">Reason before revealing</span>
      <h1>Four questions. No hints.</h1>
      <p class="lede">The spokesperson reads each question aloud. Work from the observed results and show your calculations.</p>
    </section>

    ${baselineFacts()}
    ${discussionQuestionList()}

    <div class="action-panel action-panel--reveal">
      <p><strong>Finish Question 4 first.</strong> The next screen contains every calculation and the lesson’s central result.</p>
      <button class="button button--primary" type="button" data-action="show-answers">We discussed them — reveal answers</button>
    </div>
  `);
}

function renderAnswerKey(role) {
  const isSpokesperson = role.isSpokesperson;
  app.innerHTML = pageShell(`
    ${isSpokesperson ? spokespersonProgress("discussion") : ""}
    <section class="reveal-hero">
      <span class="eyebrow">Answer key</span>
      <h1>The lesson changes when one value changes.</h1>
      <p class="lede">The original screening shows how student pricing can expand access. The counterfactual shows why that result cannot be generalized.</p>
    </section>

    <section class="answer-explanations">
      <article>
        <span>01 · Empty seats</span>
        <h2>Lowering one price cuts the margin on every ticket.</h2>
        <p>At $8, profit is <strong>($8 − $1) × 3 = $21</strong>. At $4, profit is <strong>($4 − $1) × 6 = $18</strong>. Filling the theater is not the same as maximizing profit.</p>
      </article>
      <article>
        <span>02 · Student ID and resale</span>
        <h2>The theater must identify the group and keep the discount from transferring.</h2>
        <p>Without ID checks, movie fans claim the $4 ticket. With resale, students can buy low and resell to movie fans. Either route undermines the $8 general-admission price.</p>
      </article>
    </section>

    <section class="card answer-table" aria-labelledby="baseline-answer-heading">
      <span class="eyebrow">03 · Stakeholder ledger</span>
      <h2 id="baseline-answer-heading">What changed in the original screening?</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Outcome</th><th>One $8 price</th><th>$8 general / $4 student</th><th>Change</th></tr></thead>
          <tbody>
            <tr><td>Tickets sold</td><td>3</td><td>6</td><td><strong>+3</strong></td></tr>
            <tr><td>Theater profit</td><td>$21</td><td>$30</td><td><strong>+$9</strong></td></tr>
            <tr><td>Movie-fan surplus</td><td>$3</td><td>$3</td><td>$0</td></tr>
            <tr><td>Student surplus</td><td>$0</td><td>$3</td><td><strong>+$3</strong></td></tr>
            <tr><td>Total surplus</td><td>$24</td><td>$36</td><td><strong>+$12</strong></td></tr>
          </tbody>
        </table>
      </div>
      <p class="calculation-note">The $12 increase in total surplus comes from three new attendees: ($6 − $1) + ($5 − $1) + ($4 − $1) = $12.</p>
    </section>

    <section class="card answer-table twist-answer" aria-labelledby="twist-answer-heading">
      <span class="eyebrow">04 · Counterfactual</span>
      <h2 id="twist-answer-heading">Change the third movie fan from $8 to $5</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Outcome</th><th>Best one-price policy</th><th>Best student-pricing policy</th></tr></thead>
          <tbody>
            <tr><td>Prices</td><td>$5 for everyone</td><td>$9 general / $4 student</td></tr>
            <tr><td>Tickets sold</td><td>5</td><td>5</td></tr>
            <tr><td>Theater profit</td><td>$20</td><td><strong>$25</strong></td></tr>
            <tr><td>Consumer surplus</td><td><strong>$10</strong></td><td>$4</td></tr>
            <tr><td>Total surplus</td><td><strong>$30</strong></td><td>$29</td></tr>
          </tbody>
        </table>
      </div>
      <p class="calculation-note">Student pricing still raises profit by $5, but total surplus falls by $1. With the same five tickets sold, a movie fan worth $5 is replaced by a student worth $4.</p>
    </section>

    <div class="notice">
      <strong>Bottom line:</strong> different prices can expand output and raise total surplus, but they do not always do so. The result depends on who is in each group and how purchasing changes.
    </div>

    <section class="report-card ${state.completed ? "report-card--ready" : ""}">
      <div>
        <span class="eyebrow">${isSpokesperson ? "Spokesperson" : "Your room"}</span>
        <h2>${state.completed ? "Your room is ready." : isSpokesperson ? "Be ready if your instructor calls on you." : "Help your spokesperson choose one takeaway."}</h2>
        <p>No result is submitted. Be ready to explain why the two examples produce different total-surplus results.</p>
      </div>
      ${
        isSpokesperson
          ? state.completed
            ? '<span class="ready-check" aria-label="Ready">✓</span>'
            : '<button class="button button--primary" type="button" data-action="mark-ready">We are ready to report</button>'
          : ""
      }
    </section>
  `);
}

function renderMarketRole(role) {
  const marketId = role.id === "high-market" ? "high" : "low";
  const market = MARKETS[marketId];
  app.innerHTML = pageShell(
    `
      <section class="role-banner role-banner--market role-banner--${marketId}">
        <span class="role-banner__label">Your private role</span>
        <h1>${market.label}</h1>
        <p>You represent three people considering tonight’s movie. Keep their willingness to pay hidden from the theater and the other group.</p>
      </section>

      <section class="secret-card" aria-labelledby="private-values-heading">
        <div>
          <span class="eyebrow">Private information</span>
          <h2 id="private-values-heading">The most each person would pay for one ticket</h2>
        </div>
        <div class="customer-values">
          ${market.values
            .map(
              (value, index) => `
                <div><span>${marketId === "low" ? "Student" : "Movie fan"} ${index + 1}</span><strong>${money(value)}</strong></div>
              `,
            )
            .join("")}
        </div>
        <p class="secret-card__rule">A person buys one ticket when the announced price is less than or equal to their willingness to pay.</p>
      </section>

      <section class="card demand-tool" aria-labelledby="demand-tool-heading">
        <div class="section-heading">
          <span class="step-kicker">Each attempt</span>
          <div>
            <h2 id="demand-tool-heading">Report your quantity</h2>
            <p>Enter the price announced for your market. Say only the resulting number aloud.</p>
          </div>
        </div>
        <form id="demand-form" class="demand-form" novalidate>
          <label class="field">
            <span>Price announced to your market</span>
            <span class="money-input"><span>$</span><input id="market-price" type="number" inputmode="numeric" min="1" max="10" step="1" required></span>
          </label>
          <button class="button button--primary" type="submit">Find quantity</button>
        </form>
        <div id="demand-error" class="form-error" role="alert"></div>
        <div id="demand-answer" class="demand-answer" aria-live="polite">
          <span>Waiting for a price</span>
          <p>The spokesperson will ask for your answer three times in each treatment.</p>
        </div>
      </section>

      <section class="role-reminders">
        <h2>Your job</h2>
        <ul>
          <li>Listen for the price announced to your market.</li>
          <li>Report how many of your three customers buy: 0, 1, 2, or 3.</li>
          <li>Do not suggest ticket prices or reveal willingness to pay during play.</li>
          <li>Follow the spokesperson’s phase announcements.</li>
        </ul>
      </section>
      <section class="participant-reveal-prompt">
        <div><strong>Has the spokesperson reached the reveal?</strong><p>Do not open this early—it contains both customer groups’ private information.</p></div>
        <button class="button button--secondary" type="button" data-action="participant-reveal">Open the final reveal</button>
      </section>
    `,
    { narrow: true },
  );
}

function renderManagerRole(role) {
  app.innerHTML = pageShell(
    `
      <section class="role-banner role-banner--ceo">
        <span class="role-banner__label">Your role</span>
        <h1>Theater manager</h1>
        <p>Your goal is to maximize profit from tonight’s screening. Tell the spokesperson what to enter on every attempt.</p>
      </section>

      <div class="ceo-layout">
        <section class="card">
          <span class="eyebrow">What you know</span>
          <h2>Each additional attendee costs the theater $1.</h2>
          <p>This represents ticketing and cleanup. You do not know what either customer group would pay. Use reported ticket sales and profit to revise your strategy.</p>
          <div class="formula-box">Ticket profit = (price − $1) × tickets sold</div>
        </section>
        <section class="card">
          <span class="eyebrow">Treatment 1</span>
          <h2>One ticket price</h2>
          <p>Choose one whole-dollar general-admission price from $1 through $10. Everyone sees the same price. You get three attempts.</p>
        </section>
        <section class="card">
          <span class="eyebrow">Treatment 2</span>
          <h2>Verified student pricing</h2>
          <p>Choose a general-admission price and a student price. Student ID is checked at the door. You get three attempts.</p>
        </section>
      </div>

      <section class="card decision-pad" aria-labelledby="decision-pad-heading">
        <div class="section-heading">
          <span class="step-kicker">Optional notes</span>
          <div><h2 id="decision-pad-heading">Keep track of your ideas</h2><p>These notes stay only in this tab.</p></div>
        </div>
        <label class="field"><span>Prices or strategy to try next</span><textarea rows="5" placeholder="Example: Try a lower price to reach more customers…"></textarea></label>
      </section>
      <div class="notice"><strong>Follow the spokesperson.</strong> They run the phases, calculations, and final reveal.</div>
      <section class="participant-reveal-prompt">
        <div><strong>Has the spokesperson reached the reveal?</strong><p>Do not open this early—it contains both customer groups’ private information.</p></div>
        <button class="button button--secondary" type="button" data-action="participant-reveal">Open the final reveal</button>
      </section>
    `,
    { narrow: true },
  );
}

function renderParticipantReveal(role) {
  app.innerHTML = pageShell(`
    <section class="discussion-hero">
      <span class="eyebrow">Reason before revealing</span>
      <h1>Four questions. No hints.</h1>
      <p class="lede">Help your spokesperson work from the results and show the calculations.</p>
    </section>

    ${baselineFacts()}
    ${discussionQuestionList()}

    <div class="action-panel action-panel--reveal">
      <p><strong>Finish Question 4 first.</strong> The next screen contains every calculation and the lesson’s central result.</p>
      <button class="button button--primary" type="button" data-action="show-answers">We discussed them — reveal answers</button>
    </div>
  `);
}

function showFormError(message) {
  // The container carries role="alert", so assigning text is what announces the message.
  const error = document.querySelector("#form-error");
  if (error) {
    error.textContent = message;
  }
}

function numberFrom(selector) {
  const field = document.querySelector(selector);
  return field?.value === "" ? Number.NaN : Number(field.value);
}

function submitUniformAttempt() {
  const report = {
    price: numberFrom("#uniform-price"),
    highQuantity: numberFrom("#uniform-high-quantity"),
    lowQuantity: numberFrom("#uniform-low-quantity"),
  };
  const validation = validateUniformReport(report);
  if (validation.reason === "price") {
    showFormError("Enter a whole-dollar price from $1 through $10.");
    return;
  }
  if (validation.reason === "quantity") {
    showFormError("Choose the number of tickets sold to both customer groups.");
    return;
  }
  if (validation.reason === "mismatch") {
    showFormError("One or more ticket totals do not match this price. Ask both customer representatives to check again.");
    return;
  }

  state.uniformAttempts.push(
    makeUniformAttempt(report.price, report.highQuantity, report.lowQuantity),
  );
  persistState();
  render();
}

function submitGroupAttempt() {
  const report = {
    highPrice: numberFrom("#group-high-price"),
    highQuantity: numberFrom("#group-high-quantity"),
    lowPrice: numberFrom("#group-low-price"),
    lowQuantity: numberFrom("#group-low-quantity"),
  };
  const validation = validateGroupReport(report);
  if (validation.reason === "price") {
    showFormError("Enter a whole-dollar general-admission and student price from $1 through $10.");
    return;
  }
  if (validation.reason === "quantity") {
    showFormError("Choose the number of tickets sold to both customer groups.");
    return;
  }
  if (validation.reason === "mismatch") {
    showFormError("One or more ticket totals do not match the corresponding price. Ask both customer representatives to check again.");
    return;
  }

  state.groupAttempts.push(
    makeGroupAttempt(
      report.highPrice,
      report.highQuantity,
      report.lowPrice,
      report.lowQuantity,
    ),
  );
  persistState();
  render();
}

function submitDemandCheck() {
  const price = numberFrom("#market-price");
  const error = document.querySelector("#demand-error");
  const answer = document.querySelector("#demand-answer");
  if (!Number.isInteger(price) || price < 1 || price > 10) {
    error.textContent = "Enter the whole-dollar ticket price announced by the theater, from $1 through $10.";
    answer.innerHTML = "<span>Waiting for a valid price</span>";
    return;
  }

  error.textContent = "";
  const marketId = state.role === "high-market" ? "high" : "low";
  const quantity = demandAtPrice(marketId, price);
  const noun = quantity === 1 ? "customer buys" : "customers buy";
  answer.innerHTML = `
    <span>At ${money(price)}:</span>
    <strong>${quantity}</strong>
    <p>${noun}. Say <strong>“Quantity ${quantity}”</strong> aloud.</p>
  `;
}

function handleClick(event) {
  const sizeButton = event.target.closest("[data-group-size]");
  if (sizeButton) {
    setState({ groupSize: Number(sizeButton.dataset.groupSize), role: null, phase: "roles" });
    return;
  }

  const roleButton = event.target.closest("[data-role]");
  if (roleButton) {
    setState({ role: roleButton.dataset.role, phase: "setup" });
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }
  const action = actionButton.dataset.action;
  if (action === "reset") {
    resetActivity();
  } else if (action === "change-size") {
    setState({ groupSize: null, role: null, phase: "landing" });
  } else if (action === "start-game") {
    setState({ phase: "uniform" });
  } else if (action === "remove-uniform") {
    state.uniformAttempts.pop();
    persistState();
    render();
  } else if (action === "next-group") {
    setState({ phase: "group" });
  } else if (action === "remove-group") {
    state.groupAttempts.pop();
    persistState();
    render();
  } else if (action === "next-reveal") {
    setState({ phase: "reveal" });
  } else if (action === "next-discussion") {
    setState({ phase: "discussion" });
  } else if (action === "show-answers") {
    setState({ phase: "answers" });
  } else if (action === "mark-ready") {
    setState({ completed: true });
  } else if (action === "participant-reveal") {
    setState({ phase: "reveal" });
  }
}

function handleSubmit(event) {
  event.preventDefault();
  if (event.target.id === "uniform-form") {
    submitUniformAttempt();
  } else if (event.target.id === "group-form") {
    submitGroupAttempt();
  } else if (event.target.id === "demand-form") {
    submitDemandCheck();
  }
}

function render() {
  const role = roleForState(state.groupSize, state.role);
  if (!state.groupSize || state.phase === "landing") {
    renderLanding();
  } else if (!role || state.phase === "roles") {
    renderRoleSelection();
  } else if (!role.isSpokesperson) {
    if (state.phase === "answers") {
      renderAnswerKey(role);
    } else if (state.phase === "reveal" || state.phase === "discussion") {
      renderParticipantReveal(role);
    } else if (role.id === "theater-manager") {
      renderManagerRole(role);
    } else {
      renderMarketRole(role);
    }
  } else if (state.phase === "setup") {
    renderSpokespersonSetup(role);
  } else if (state.phase === "uniform") {
    renderUniformPhase();
  } else if (state.phase === "group") {
    renderGroupPhase();
  } else if (state.phase === "reveal") {
    renderReveal();
  } else if (state.phase === "discussion") {
    renderDiscussion();
  } else {
    renderAnswerKey(role);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

app.addEventListener("click", handleClick);
app.addEventListener("submit", handleSubmit);
render();
