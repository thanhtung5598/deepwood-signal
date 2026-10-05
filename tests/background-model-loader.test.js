import assert from "node:assert/strict";
import test from "node:test";
import { createBackgroundModelLoader } from "../src/background-model-loader.js";

test("two parallel downloads preserve priority and refill a free slot", async () => {
  const requested = [];
  const releases = new Map();
  let active = 0;
  let peak = 0;
  let robotStarted;
  const nextRequest = new Promise((resolve) => { robotStarted = resolve; });
  const loader = createBackgroundModelLoader({
    async loadAsync(url) {
      requested.push(url);
      active++;
      peak = Math.max(peak, active);
      if (url === "robot") robotStarted();
      try {
        if (url === "bird" || url === "rocks") {
          await new Promise((resolve) => releases.set(url, resolve));
        }
        return url;
      } finally {
        active--;
      }
    },
  }, ["bird", "rocks", "robot", "logs"], 2);
  for (const url of ["logs", "rocks", "robot", "bird"]) loader.load(url);
  const completion = loader.start();
  assert.equal(loader.start(), completion);
  await Promise.resolve();
  assert.deepEqual(requested, ["bird", "rocks"]);
  assert.equal(active, 2);
  releases.get("rocks")();
  await nextRequest;
  assert.deepEqual(requested, ["bird", "rocks", "robot"]);
  releases.get("bird")();
  await completion;
  assert.deepEqual(requested, ["bird", "rocks", "robot", "logs"]);
  assert.equal(peak, 2);
});

test("configured priorities override registration order and keep unlisted assets last", async () => {
  const requested = [];
  const loader = createBackgroundModelLoader({
    async loadAsync(url) { requested.push(url); return url; },
  }, ["bird", "rocks", "robot-detail", "logs", "shrubs", "berries", "oak"]);
  for (const url of ["extra-a", "oak", "rocks", "logs", "shrubs", "berries", "robot-detail", "bird", "extra-b"]) {
    loader.load(url);
  }
  await Promise.resolve();
  assert.deepEqual(requested, []);
  await loader.start();
  assert.deepEqual(requested, ["bird", "rocks", "robot-detail", "logs", "shrubs", "berries", "oak", "extra-a", "extra-b"]);
});

test("scene details do not download until the background queue is started", async () => {
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
  }, [], 2);
  loader.load("trees", (model) => installed.push(model), undefined, (error) => errors.push(error));
  loader.load("rocks", (model) => installed.push(model));
  await loader.start();
  assert.equal(errors.length, 1);
  assert.deepEqual(installed, ["rocks"]);
});
