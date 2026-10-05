const STORAGE_KEY = "deepwood-mission-briefing-seen-v1";

export function createMissionBriefing(getStorage = () => null) {
  let seen = false;
  try { seen = getStorage()?.getItem(STORAGE_KEY) === "true"; } catch { /* Storage may be unavailable. */ }
  let started = false;
  let elapsed = 0;
  const duration = 4;

  return {
    firstVisit: !seen,
    get started() { return started; },
    get ready() { return started && elapsed >= duration; },
    get progress() { return elapsed / duration; },
    get remainingSeconds() { return Math.ceil(duration - elapsed); },
    get step() { return Math.min(2, Math.floor((elapsed / duration) * 3)); },
    begin() {
      if (started) return;
      started = true;
      elapsed = seen ? duration : 0;
    },
    advance(seconds) {
      if (started) elapsed = Math.min(duration, elapsed + Math.max(0, seconds));
    },
    markSeen() {
      if (elapsed < duration || !started) return;
      seen = true;
      try { getStorage()?.setItem(STORAGE_KEY, "true"); } catch { /* Play still works without storage. */ }
    },
  };
}
