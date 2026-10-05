// Keep optional scene models off the startup path and load them one at a time.
export function createBackgroundModelLoader(loader) {
  const queue = [];
  let started = false;
  let active;

  function drain() {
    if (active) return active;
    active = Promise.resolve().then(async () => {
      while (queue.length) {
        const { url, onLoad, onProgress, onError } = queue.shift();
        try {
          const model = await loader.loadAsync(url, onProgress);
          await onLoad?.(model);
        } catch (error) {
          onError?.(error);
        }
        // Give rendering/input a turn between model installations.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }).finally(() => { active = undefined; });
    return active;
  }

  return {
    load(url, onLoad, onProgress, onError) {
      queue.push({ url, onLoad, onProgress, onError });
      if (started) void drain();
    },
    start() {
      started = true;
      return drain();
    },
  };
}
