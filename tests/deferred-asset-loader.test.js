import assert from "node:assert/strict";
import test from "node:test";
import { createDeferredAssetLoader } from "../src/deferred-asset-loader.js";

test("background download and round transition share one pending load", async () => {
  let complete;
  let attempts = 0;
  const load = createDeferredAssetLoader(() => {
    attempts += 1;
    return new Promise((resolve) => { complete = resolve; });
  });
  const background = load();
  const transition = load();
  await Promise.resolve();
  assert.equal(attempts, 1);
  assert.equal(background, transition);
  complete("guardian");
  assert.equal(await transition, "guardian");
  assert.equal(await load(), "guardian");
  assert.equal(attempts, 1);
});

test("a failed background download can be retried at the round transition", async () => {
  let attempts = 0;
  const load = createDeferredAssetLoader(async () => {
    if (++attempts === 1) throw new Error("connection interrupted");
    return "guardian";
  });
  await assert.rejects(load(), /connection interrupted/);
  assert.equal(await load(), "guardian");
  assert.equal(attempts, 2);
});

test("synchronous loader errors also leave the download retryable", async () => {
  let attempts = 0;
  const load = createDeferredAssetLoader(() => {
    if (++attempts === 1) throw new Error("invalid model");
    return "guardian";
  });
  await assert.rejects(load(), /invalid model/);
  assert.equal(await load(), "guardian");
});
