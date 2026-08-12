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
      version: 3,
      groupSize,
      role,
      phase,
      uniformAttempts: [],
      groupAttempts: [],
      completed: false,
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

test("discussion requires reasoning before the answer key is revealed", async () => {
  const appSource = await source("app.js");
  assert.match(appSource, /Why did the theater earn more by charging \$8 and leaving three seats empty/);
  assert.match(appSource, /stopped checking student IDs or allowed tickets to be resold/);
  assert.match(appSource, /whose surplus changed—and by how much/);
  assert.match(appSource, /third movie fan would pay only \$5 rather than \$8/);
  assert.match(appSource, /data-action="show-answers"/);
  assert.match(appSource, /setState\(\{ phase: "answers" \}\)/);
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

test("saved discussion and answer-key states render their intended content", async () => {
  const [logicSource, appSource] = await Promise.all([
    source("game-logic.js"),
    source("app.js"),
  ]);

  function renderSavedPhase(phase) {
    const appElement = { innerHTML: "", addEventListener() {} };
    const savedState = JSON.stringify({
      version: 3,
      groupSize: 3,
      role: "combined-controller",
      phase,
      uniformAttempts: [],
      groupAttempts: [],
      completed: false,
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
  assert.match(discussion, /Four questions\. No hints\./);
  assert.match(discussion, /We discussed them — reveal answers/);
  assert.doesNotMatch(discussion, /Total surplus<\/td>/);

  const answers = renderSavedPhase("answers");
  assert.match(answers, /The lesson changes when one value changes\./);
  assert.match(answers, /Student pricing still raises profit by \$5, but total surplus falls by \$1/);
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
