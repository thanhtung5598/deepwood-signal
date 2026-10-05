import assert from "node:assert/strict";
import test from "node:test";
import { createMissionBriefing } from "../src/mission-briefing.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("the first briefing reveals three steps and unlocks after four seconds", () => {
  const briefing = createMissionBriefing();
  briefing.advance(10);
  assert.equal(briefing.ready, false);
  briefing.begin();
  assert.equal(briefing.firstVisit, true);
  assert.equal(briefing.remainingSeconds, 4);
  assert.equal(briefing.step, 0);
  briefing.advance(1.5);
  assert.equal(briefing.step, 1);
  assert.equal(briefing.remainingSeconds, 3);
  briefing.begin();
  assert.equal(briefing.remainingSeconds, 3);
  briefing.advance(1.5);
  assert.equal(briefing.step, 2);
  assert.equal(briefing.remainingSeconds, 1);
  assert.equal(briefing.ready, false);
  briefing.advance(1);
  assert.equal(briefing.ready, true);
  assert.equal(briefing.remainingSeconds, 0);
});

test("returning players can start immediately after the first mission was started", () => {
  const saved = storage();
  const first = createMissionBriefing(() => saved);
  first.begin();
  first.advance(4);
  first.markSeen();
  const next = createMissionBriefing(() => saved);
  assert.equal(next.firstVisit, false);
  next.begin();
  assert.equal(next.ready, true);
  assert.equal(next.remainingSeconds, 0);
});

test("an incomplete briefing is not saved as seen", () => {
  const saved = storage();
  const first = createMissionBriefing(() => saved);
  first.begin();
  first.advance(2);
  first.markSeen();
  const next = createMissionBriefing(() => saved);
  assert.equal(next.firstVisit, true);
  next.begin();
  assert.equal(next.ready, false);
});

test("unavailable storage still allows the first mission to start", () => {
  const briefing = createMissionBriefing(() => { throw new Error("storage blocked"); });
  briefing.begin();
  briefing.advance(4);
  assert.equal(briefing.ready, true);
  assert.doesNotThrow(() => briefing.markSeen());
});
