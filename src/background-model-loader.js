// Keep optional models off the startup path and limit concurrent downloads.
export function createBackgroundModelLoader(loader, loadOrder = [], concurrency = 1) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Model download concurrency must be a positive integer");
  }
  const queue = [];
  const priorities = new Map(loadOrder.map((url, index) => [url, index]));
  let started = false;
  let active;

  async function runWorker() {
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
  }

  function drain() {
    if (active) return active;
    active = Promise.resolve().then(() => Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, runWorker),
    )).finally(() => {
      active = undefined;
      if (queue.length) void drain();
    });
    return active;
  }

  return {
    load(url, onLoad, onProgress, onError) {
      queue.push({ url, onLoad, onProgress, onError });
      queue.sort((a, b) =>
        (priorities.get(a.url) ?? loadOrder.length) -
        (priorities.get(b.url) ?? loadOrder.length),
      );
      if (started) void drain();
    },
    start() {
      started = true;
      return drain();
    },
  };
}
