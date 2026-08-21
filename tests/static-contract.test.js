/**
 * Checks deployment, privacy, navigation, content, and baseline accessibility contracts.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { Script, createContext } from "node:vm";

const projectRoot = new URL("../", import.meta.url);

async function source(filename) {
  return readFile(new URL(filename, projectRoot), "utf8");
}

function savedState(phase, overrides = {}) {
  return JSON.stringify({
    version: 5,
    phase,
    shareAcknowledged: true,
    attempts: { august: [], september: [], october: [] },
    predictions: {
      september: { profit: "same", quantity: "same" },
      october: { profit: "increase", quantity: "increase" },
    },
    ...overrides,
  });
}

async function renderSavedPhase(phase, overrides = {}) {
  const [logicSource, appSource] = await Promise.all([source("game-logic.js"), source("app.js")]);
  const appElement = { innerHTML: "", addEventListener() {} };
  const context = createContext({
    document: {
      querySelector(selector) {
        return { "#app": appElement }[selector] ?? null;
      },
    },
    window: {
      localStorage: {
        getItem() { return savedState(phase, overrides); },
        setItem() {},
        removeItem() {},
      },
      scrollTo() {},
      confirm() { return true; },
    },
  });
  new Script(logicSource, { filename: "game-logic.js" }).runInContext(context);
  new Script(appSource, { filename: "app.js" }).runInContext(context);
  return appElement.innerHTML;
}

test("entry point includes accessibility, CSP, and direct-file scripts", async () => {
  const html = await source("index.html");
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main id="app"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<script defer src="game-logic\.js"><\/script>/);
  assert.match(html, /<script defer src="app\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
});

test("fresh experience renders only the screen-sharing button", async () => {
  const rendered = await renderSavedPhase("share", { shareAcknowledged: false });
  assert.equal((rendered.match(/<button/g) ?? []).length, 1);
  assert.match(rendered, />Share your screen<\/button>/);
  assert.doesNotMatch(rendered, /Movie Ticket Pricing|Start over|progress|img/);

  const ready = await renderSavedPhase("share", { shareAcknowledged: true });
  assert.equal((ready.match(/<button/g) ?? []).length, 1);
  assert.match(ready, />Start<\/button>/);
});

test("August setup discloses market sizes, capacity, cost, and search rules", async () => {
  const rendered = await renderSavedPhase("setup-august");
  assert.match(rendered, /30 local residents/);
  assert.match(rendered, /30 \+ 30/);
  assert.match(rendered, /60[\s\S]*seats in the theater/);
  assert.match(rendered, /\$1[\s\S]*marginal cost per ticket sold/);
  assert.match(rendered, /pays a \$1 marginal cost for each additional ticket it sells/);
  assert.match(rendered, /whole-dollar price from \$1 through \$10/);
  assert.match(rendered, /Open the August box office/);
});

test("monthly play screens use automatic demand feedback and correct information detail", async () => {
  const august = await renderSavedPhase("play-august");
  assert.match(august, /Choose one ticket price/);
  assert.match(august, /Set price and see results/);
  assert.doesNotMatch(august, /quantity-select|report.*sales|customer representative/i);

  const september = await renderSavedPhase("play-september");
  assert.match(september, /All 30 locals and 30 college students/);
  assert.match(september, /everyone must be charged the same price/);

  const october = await renderSavedPhase("play-october");
  assert.match(october, /Student IDs are checked and tickets are nontransferable/);
  assert.match(october, /any two whole-dollar prices/);
  assert.match(october, /Price for locals/);
  assert.match(october, /Price for college students/);
});

test("prediction screens ask about optimal profit and quantity without revealing answers", async () => {
  const september = await renderSavedPhase("predict-september", {
    predictions: {
      september: { profit: null, quantity: null },
      october: { profit: null, quantity: null },
    },
  });
  assert.match(september, /what will happen to the maximum possible profit/);
  assert.match(september, /At the profit-maximizing price/);
  assert.match(september, /Increase/);
  assert.match(september, /Decrease/);
  assert.match(september, /Stay the same/);
  assert.match(september, /answers stay hidden until the final summary/i);
  assert.doesNotMatch(september, /Answer:/);

  const october = await renderSavedPhase("predict-october");
  assert.match(october, /independently choose one price for locals and another/);
  assert.match(october, /tickets cannot be transferred/);
});

test("recap offers replay and final-summary paths without revealing benchmarks", async () => {
  const recap = await renderSavedPhase("recap");
  assert.match(recap, /Three months at the box office/);
  assert.match(recap, /Redo the exercise/);
  assert.match(recap, /Continue to final summary/);
  assert.doesNotMatch(recap, /The economic answer|The most each person would pay/);
});

test("final summary reveals distributions, optima, charts, predictions, and exact questions", async () => {
  const summary = await renderSavedPhase("summary");
  assert.match(summary, /30 locals/);
  assert.match(summary, /\$10[\s\S]*× 10 people[\s\S]*\$9[\s\S]*\$8/);
  assert.match(summary, /30 college students/);
  assert.match(summary, /\$6[\s\S]*× 10 people[\s\S]*\$5[\s\S]*\$4/);
  assert.match(summary, /\$8 for everyone/);
  assert.match(summary, /\$8 locals · \$4 students/);
  assert.match(summary, /\$210/);
  assert.match(summary, /\$300/);
  assert.match(summary, /Profit at every uniform ticket price/);
  assert.match(summary, /October profit separates into two parts/);
  assert.equal((summary.match(/<svg/g) ?? []).length, 3);
  assert.match(summary, /Answer: Stay the same/);
  assert.match(summary, /Answer: Increase/);
  assert.match(summary, /In the time remaining, discuss the following questions\./);
  assert.match(summary, /Why would a theater choose a price that leaves some seats empty\?/);
  assert.match(summary, /Why does the theater ignore students when they arrive back on campus\?/);
  assert.match(summary, /What would happen here if the students could buy tickets at a discount and then re-sell them to locals\?/);
  assert.doesNotMatch(summary, /Answer key|Bottom line/);
});

test("the old role-based, multi-device experience is removed", async () => {
  const combined = [await source("app.js"), await source("game-logic.js")].join("\n");
  assert.doesNotMatch(combined, /groupSize|roleForState|ROLE_OPTIONS|customer representative|theater manager role/i);
  assert.doesNotMatch(combined, /quantitySelect|validateUniformReport|validateGroupReport/);
});

test("submitted attempts cannot be corrected or removed", async () => {
  const appSource = await source("app.js");
  assert.doesNotMatch(appSource, /Correct latest|undo-attempt|slice\(0, -1\)/);
});

test("production source contains no remote requests or remote assets", async () => {
  const filenames = ["index.html", "app.js", "game-logic.js", "styles.css"];
  const combined = (await Promise.all(filenames.map(source))).join("\n");
  assert.doesNotMatch(combined, /https?:\/\//i);
  assert.doesNotMatch(combined, /\bfetch\s*\(/);
  assert.doesNotMatch(combined, /XMLHttpRequest|sendBeacon|WebSocket/);
  assert.match(combined, /connect-src 'none'/);
});

test("local product image remains optimized and described", async () => {
  const appSource = await source("app.js");
  const imageStats = await stat(new URL("assets/movie-ticket-hero.jpg", projectRoot));
  assert.match(appSource, /src="assets\/movie-ticket-hero\.jpg"/);
  assert.match(appSource, /alt="Two blank movie tickets beside popcorn in a theater\."/);
  assert.ok(imageStats.size < 400_000);
});

test("browser scripts remain compatible with direct file opening", async () => {
  const [appSource, logicSource] = await Promise.all([source("app.js"), source("game-logic.js")]);
  assert.doesNotMatch(appSource, /^\s*import\s/m);
  assert.doesNotMatch(logicSource, /^\s*export\s/m);
  assert.match(logicSource, /globalThis\.MovieTicketGameLogic/);
});

test("site has no timer and retains responsive accessibility rules", async () => {
  const [appSource, css] = await Promise.all([source("app.js"), source("styles.css")]);
  assert.doesNotMatch(appSource, /setInterval|countdown|elapsed-time|class="timer"/i);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
});

test("repository excludes non-site project files", async () => {
  const [config, ignore] = await Promise.all([source("_config.yml"), source(".gitignore")]);
  assert.match(config, /^exclude:/m);
  assert.match(config, /^\s+-\s+tests\/$/m);
  assert.match(config, /^\s+-\s+package\.json$/m);
  assert.match(config, /^\s+-\s+README\.md$/m);
  assert.match(ignore, /^\/instructor\/$/m);
  await assert.rejects(stat(new URL(".nojekyll", projectRoot)));
});
