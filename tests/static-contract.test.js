/**
 * Checks deployment, privacy, navigation, and baseline accessibility contracts in static source.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { Script, createContext } from "node:vm";

const projectRoot = new URL("../", import.meta.url);

async function source(filename) {
  return readFile(new URL(filename, projectRoot), "utf8");
}

test("student entry point includes essential accessibility and fallback elements", async () => {
  const html = await source("index.html");
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main id="app"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /<script defer src="game-logic\.js"><\/script>/);
  assert.match(html, /<script defer src="app\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
});

test("the repository excludes instructor resources and non-site project files", async () => {
  const [config, ignore] = await Promise.all([source("_config.yml"), source(".gitignore")]);
  assert.match(config, /^exclude:/m);
  assert.match(config, /^\s+-\s+tests\/$/m);
  assert.match(config, /^\s+-\s+package\.json$/m);
  assert.match(config, /^\s+-\s+README\.md$/m);
  assert.match(ignore, /^\/instructor\/$/m);

  // A .nojekyll file would switch off Jekyll, and the exclude rule with it.
  await assert.rejects(stat(new URL(".nojekyll", projectRoot)));

  await assert.rejects(stat(new URL("instructor/", projectRoot)));
});

test("production source contains no remote requests or remote assets", async () => {
  const filenames = ["index.html", "app.js", "game-logic.js", "styles.css"];
  const combined = (await Promise.all(filenames.map(source))).join("\n");
  assert.doesNotMatch(combined, /https?:\/\//i);
  assert.doesNotMatch(combined, /\bfetch\s*\(/);
  assert.doesNotMatch(combined, /XMLHttpRequest|sendBeacon|WebSocket/);
  assert.match(combined, /connect-src 'none'/);
});

test("the product image is local, optimized, and described", async () => {
  const appSource = await source("app.js");
  const imageStats = await stat(new URL("assets/movie-ticket-hero.jpg", projectRoot));
  assert.match(appSource, /src="assets\/movie-ticket-hero\.jpg"/);
  assert.match(appSource, /alt="Two blank movie tickets beside popcorn in a theater\."/);
  assert.ok(imageStats.size < 400_000, `Expected optimized image, received ${imageStats.size} bytes`);
});

test("the student experience contains no timer implementation", async () => {
  const filenames = ["index.html", "app.js", "game-logic.js", "styles.css"];
  const combined = (await Promise.all(filenames.map(source))).join("\n");
  assert.doesNotMatch(combined, /timer|countdown|time remaining/i);
});

test("the spokesperson assigns the other roles in every room size", async () => {
  const [appSource, logicSource] = await Promise.all([
    source("app.js"),
    source("game-logic.js"),
  ]);

  function renderSavedState(groupSize, role, phase) {
    const appElement = { innerHTML: "", addEventListener() {} };
    const savedState = JSON.stringify({
      version: 4,
      groupSize,
      role,
      phase,
      uniformAttempts: [],
      groupAttempts: [],
    });
    const context = createContext({
      document: {
        querySelector(selector) {
          return { "#app": appElement }[selector];
        },
      },
      window: {
        localStorage: {
          getItem() { return savedState; },
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

  const threePersonRoles = renderSavedState(3, null, "roles");
  const fourPersonRoles = renderSavedState(4, null, "roles");
  for (const renderedRoles of [threePersonRoles, fourPersonRoles]) {
    assert.match(renderedRoles, /Choose a spokesperson first/);
    assert.match(renderedRoles, /The spokesperson assigns every other role aloud/);
    assert.match(renderedRoles, /<strong>Spokesperson<\/strong>/);
    assert.match(renderedRoles, /role-card__badge">Choose first/);
  }
  assert.ok(
    fourPersonRoles.indexOf("Spokesperson") < fourPersonRoles.indexOf("Theater manager"),
  );

  const threePersonSetup = renderSavedState(3, "combined-controller", "setup");
  assert.match(threePersonSetup, /assign the other roles, choose every ticket price/);
  assert.doesNotMatch(threePersonSetup, /Confirm that one person is the theater manager/);

  const fourPersonSetup = renderSavedState(4, "analyst-controller", "setup");
  assert.match(fourPersonSetup, /assign the other roles, ask the theater manager for each price/);
  assert.match(fourPersonSetup, /Confirm that one person is the theater manager/);

  assert.match(logicSource, /title: "Spokesperson"/);
  assert.doesNotMatch(appSource, /The controller|controller’s|>Controller<|ticketing analyst/i);
  assert.doesNotMatch(logicSource, /title: ".*controller|isController/);
});

test("the discussion poses three questions and the site holds no answer key", async () => {
  const appSource = await source("app.js");
  assert.match(appSource, /If the movie theater can only charge a single price, it is most profitable to charge \$8 and leave three seats empty/);
  assert.match(appSource, /stopped checking student IDs or allowed tickets to be resold/);
  assert.match(appSource, /third movie fan would pay only \$4 rather than \$8/);
  assert.match(appSource, /Each attendee costs the theater \$1\./);
  // Surplus is worked out aloud in the debrief, so the word never reaches the page.
  assert.doesNotMatch(appSource, /surplus/i);
  assert.doesNotMatch(appSource, /reveal answers/i);
  assert.doesNotMatch(appSource, /renderAnswerKey|phase: "answers"|Answer key|Bottom line/);
  assert.doesNotMatch(appSource, /Think about student ID checks/);
  assert.doesNotMatch(appSource, /Connect the discount to willingness to pay/);
});

test("browser scripts are compatible with direct file opening", async () => {
  const [html, appSource, logicSource] = await Promise.all([
    source("index.html"),
    source("app.js"),
    source("game-logic.js"),
  ]);
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(appSource, /^\s*import\s/m);
  assert.doesNotMatch(logicSource, /^\s*export\s/m);
  assert.match(logicSource, /globalThis\.TwoMarketsGameLogic/);
});

test("classic scripts execute in order and render the landing screen", async () => {
  const [logicSource, appSource] = await Promise.all([
    source("game-logic.js"),
    source("app.js"),
  ]);
  const appElement = {
    innerHTML: "",
    addEventListener() {},
  };
  const context = createContext({
    document: {
      querySelector(selector) {
        return { "#app": appElement }[selector];
      },
    },
    window: {
      localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {},
      },
      clearInterval() {},
      setInterval() { return 1; },
      scrollTo() {},
      confirm() { return true; },
    },
  });

  new Script(logicSource, { filename: "game-logic.js" }).runInContext(context);
  new Script(appSource, { filename: "app.js" }).runInContext(context);

  assert.match(appElement.innerHTML, /How many people are in your breakout room\?/);
});

test("the saved discussion state renders the revised questions and value comparison", async () => {
  const [logicSource, appSource] = await Promise.all([
    source("game-logic.js"),
    source("app.js"),
  ]);

  function renderSavedPhase(phase, role = "combined-controller") {
    const appElement = { innerHTML: "", addEventListener() {} };
    const savedState = JSON.stringify({
      version: 4,
      groupSize: 3,
      role,
      phase,
      uniformAttempts: [],
      groupAttempts: [],
    });
    const context = createContext({
      document: {
        querySelector(selector) {
          return { "#app": appElement }[selector];
        },
      },
      window: {
        localStorage: {
          getItem() { return savedState; },
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

  const discussion = renderSavedPhase("discussion");
  assert.match(discussion, /Three questions\./);
  assert.doesNotMatch(discussion, /No hints/);
  assert.match(discussion, /Talk these through and then we will debrief all together\./);
  assert.match(discussion, /If the movie theater can only charge a single price, it is most profitable to charge \$8 and leave three seats empty\. How can it be profitable to leave empty seats\?/);
  assert.match(discussion, /stopped checking student IDs or allowed tickets to be resold/);
  assert.match(discussion, /third movie fan would pay only \$4 rather than \$8/);
  const originalValues = discussion.indexOf("Original willingness to pay");
  const newValues = discussion.indexOf("New willingness to pay for Question 3");
  assert.ok(originalValues > discussion.indexOf("03"));
  assert.ok(newValues > originalValues);
  assert.match(discussion.slice(originalValues, newValues), /\$10[\s\S]*\$9[\s\S]*\$8[\s\S]*\$6[\s\S]*\$5[\s\S]*\$4/);
  assert.match(discussion.slice(newValues), /\$10[\s\S]*\$9[\s\S]*\$4[\s\S]*\$6[\s\S]*\$5[\s\S]*\$4/);
  assert.doesNotMatch(discussion, /type="checkbox"|data-question|question-check/);
  assert.doesNotMatch(discussion, /surplus/i);

  const participantDiscussion = renderSavedPhase("discussion", "high-market");
  assert.match(participantDiscussion, /Three questions\./);
  assert.match(participantDiscussion, /Talk these through and then we will debrief all together\./);
  assert.doesNotMatch(participantDiscussion, /No hints|type="checkbox"/);
});

test("spokesperson pricing forms state the allowed whole-dollar range", async () => {
  const appSource = await source("app.js");
  assert.equal(
    [...appSource.matchAll(/Allowed prices:<\/strong> Every ticket price must be a whole-dollar amount from \$1 through \$10\./g)].length,
    2,
  );
  for (const id of ["uniform-price", "group-high-price", "group-low-price"]) {
    assert.match(
      appSource,
      new RegExp(`id="${id}"[^>]*min="1"[^>]*max="10"[^>]*step="1"`),
    );
  }
});

test("the student page has no persistent title bar", async () => {
  const [html, appSource, css] = await Promise.all([
    source("index.html"),
    source("app.js"),
    source("styles.css"),
  ]);
  assert.doesNotMatch(html, /site-header|session-label|class="wordmark"/);
  assert.doesNotMatch(appSource, /Movie-ticket pricing game|sessionLabel/);
  assert.doesNotMatch(css, /\.site-header|\.session-label|\.wordmark/);
});

test("responsive and reduced-motion rules are present", async () => {
  const css = await source("styles.css");
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
});

test("every rendered action has a delegated click handler", async () => {
  const appSource = await source("app.js");
  const renderedActions = [...appSource.matchAll(/data-action=\\?"([a-z-]+)\\?"/g)].map(
    (match) => match[1],
  );
  assert.ok(renderedActions.length > 0);
  for (const action of new Set(renderedActions)) {
    assert.match(appSource, new RegExp(`action === ["']${action}["']`));
  }
});
