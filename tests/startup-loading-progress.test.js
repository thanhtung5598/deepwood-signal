import assert from "node:assert/strict";
import test from "node:test";
import { createStartupProgressLoader, advanceLoadingEstimate } from "../src/startup-loading-progress.js";

function fixture(sizes) {
  const requests = new Map();
  const updates = [];
  const loader = createStartupProgressLoader({
    load(url, onLoad, onProgress, onError) {
      requests.set(url, { onLoad, onProgress, onError });
    },
  }, sizes, (update) => updates.push(update));
  return { loader, requests, updates };
}

test("progress weights GLB bytes and updates before any model is installed", () => {
  const { loader, requests, updates } = fixture({ tree: 900, robot: 100 });
  loader.load("tree");
  loader.load("robot");
  requests.get("tree").onProgress({ loaded: 450, total: 900 });
  assert.equal(updates.at(-1).progress, 40.5);
  assert.equal(updates.at(-1).downloadedBytes, 450);
  assert.equal(updates.at(-1).processing, false);
});

test("compressed or missing Content-Length does not distort progress", () => {
  const { loader, requests, updates } = fixture({ tree: 1000 });
  loader.load("tree");
  requests.get("tree").onProgress({ loaded: 500, total: 200 });
  assert.equal(updates.at(-1).progress, 45);
  requests.get("tree").onProgress({ loaded: 800, total: 0 });
  assert.equal(updates.at(-1).progress, 72);
  requests.get("tree").onProgress({ loaded: 300, total: 0 });
  assert.equal(updates.at(-1).progress, 72);
});

test("download completion reserves progress for decoding and the real startup gate", () => {
  const { loader, requests, updates } = fixture({ tree: 1000 });
  let installed = false;
  loader.load("tree", () => { installed = true; });
  requests.get("tree").onProgress({ loaded: 1000 });
  assert.equal(updates.at(-1).progress, 90);
  assert.equal(updates.at(-1).processing, true);
  assert.equal(installed, false);
  requests.get("tree").onLoad({});
  assert.equal(installed, true);
  assert.equal(updates.at(-1).progress, 98);
});

test("a fallback resolves progress without counting bytes that never arrived", () => {
  const { loader, requests, updates } = fixture({ tree: 1000 });
  let failed = false;
  loader.load("tree", undefined, undefined, () => { failed = true; });
  requests.get("tree").onProgress({ loaded: 100 });
  requests.get("tree").onError(new Error("interrupted"));
  assert.equal(failed, true);
  assert.equal(updates.at(-1).downloadedBytes, 100);
  assert.equal(updates.at(-1).progress, 98);
});

test("the visual estimate advances during pauses and never regresses", () => {
  assert.ok(advanceLoadingEstimate(45, 45, 0.1) > 45);
  assert.ok(advanceLoadingEstimate(45, 20, 0.1) > 45);
  assert.ok(advanceLoadingEstimate(45, 80, 0.1) < 80);
});

test("the estimate never claims 100 percent before startup is ready", () => {
  assert.equal(advanceLoadingEstimate(99, 100, 10), 99);
  assert.equal(advanceLoadingEstimate(20, 20, -1), 20);
});
