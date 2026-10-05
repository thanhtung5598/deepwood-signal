// Share an in-flight/completed load, but allow a fresh attempt after a failure.
export function createDeferredAssetLoader(loadAsset) {
  let assetPromise;
  return function load() {
    if (!assetPromise) {
      assetPromise = Promise.resolve().then(loadAsset).catch((error) => {
        assetPromise = undefined;
        throw error;
      });
    }
    return assetPromise;
  };
}
