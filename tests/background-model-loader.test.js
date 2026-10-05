import assert from "node:assert/strict";
import test from "node:test";
import { createBackgroundModelLoader } from "../src/background-model-loader.js";

test("scene details do not download until gameplay starts", async () => {
  const requested = [];
  const installed = [];
  const loader = createBackgroundModelLoader({
    async loadAsync(url) { requested.push(url); return url; },
  });
  loader.load("trees", (model) => installed.push(model));
  loader.load("robot-detail", (model) => installed.push(model));
  await Promise.resolve();
  assert.deepEqual(requested, []);
  await loader.start();
  assert.deepEqual(requested, ["trees", "robot-detail"]);
  assert.deepEqual(installed, requested);
  await loader.start();
  assert.equal(requested.length, 2);
});

test("only one optional model downloads at a time", async () => {
  const requested = [];
  let releaseFirst;
  const loader = createBackgroundModelLoader({
    async loadAsync(url) {
      requested.push(url);
      if (url === "trees") await new Promise((resolve) => { releaseFirst = resolve; });
      return url;
    },
  });
  loader.load("trees");
  loader.load("rocks");
  const completion = loader.start();
  await Promise.resolve();
  assert.deepEqual(requested, ["trees"]);
  releaseFirst();
  await completion;
  assert.deepEqual(requested, ["trees", "rocks"]);
});

test("failed scene details keep their fallback and do not block later models", async () => {
  const installed = [];
  const errors = [];
  const loader = createBackgroundModelLoader({
    async loadAsync(url) {
      if (url === "trees") throw new Error("connection interrupted");
      return url;
    },
  });
  loader.load("trees", (model) => installed.push(model), undefined, (error) => errors.push(error));
  loader.load("rocks", (model) => installed.push(model));
  await loader.start();
  assert.equal(errors.length, 1);
  assert.deepEqual(installed, ["rocks"]);
});
