// Track decoded GLB bytes rather than LoadingManager's file/texture count.
// Expected sizes come from the build, since Content-Length may be compressed.
export function createStartupProgressLoader(loader, sizes, onChange) {
  const assets = new Map();

  function report(url) {
    let total = 0;
    let downloaded = 0;
    let resolved = 0;
    let installed = 0;
    for (const asset of assets.values()) {
      total += asset.size;
      downloaded += asset.loaded;
      resolved += asset.complete ? asset.size : asset.loaded;
      if (asset.complete) installed += asset.size;
    }
    onChange({
      progress: total ? (resolved / total) * 90 + (installed / total) * 8 : 0,
      downloadedBytes: downloaded,
      processing: [...assets.values()].every(
        (asset) => asset.complete || asset.loaded >= asset.size,
      ),
      url: [...assets.entries()].find(
        ([, asset]) => !asset.complete && asset.loaded < asset.size,
      )?.[0] ?? url,
    });
  }

  return {
    load(url, onLoad, onProgress, onError) {
      const asset = { size: sizes[url], loaded: 0, complete: false };
      assets.set(url, asset);
      report(url);
      loader.load(
        url,
        (model) => {
          onLoad?.(model);
          asset.loaded = asset.size;
          asset.complete = true;
          report(url);
        },
        (event) => {
          asset.loaded = Math.max(asset.loaded, Math.min(event.loaded, asset.size));
          report(url);
          onProgress?.(event);
        },
        (error) => {
          // The scene keeps its existing procedural fallback after a failed load.
          asset.complete = true;
          report(url);
          onError?.(error);
        },
      );
    },
  };
}

// Smooth byte updates and gently advance the estimate between network events.
// 100% is reserved for the real startup completion gate.
export function advanceLoadingEstimate(current, target, seconds) {
  const duration = Math.max(0, Math.min(seconds, 0.1));
  const smoothed = current + Math.max(0, target - current) * (1 - Math.exp(-4 * duration));
  return Math.min(99, Math.max(smoothed, current + duration * 0.45));
}
