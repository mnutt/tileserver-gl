const LRU = require("lru-cache");
const allSettled = require("promise.allsettled");

const IS_TESTING = process.env.NODE_ENV === "test";

// The real cache TTL should start from request completion, not request initiation. But
// we need to populate the cache as soon as the request starts to prevent thundering
// herd. So we initially give it this TTL, which we then replace with the real TTL upon
// request completion.
const REQUEST_TTL = 60000;

// If an origin request failed we probably don't want to hold onto the bad response for
// a long time, so cap the maximum TTL
const MAX_FAILURE_TTL = 10000;

// Remove stale entries interval
const PRUNE_INTERVAL = 10000;

/**
 * Only in our testing environment, we want to track all of the functions
 * that were memoized so that we can clear them all at the end of each test.
 */
const memoizedFunctions = new Set();

exports.memoize = function memoize(fn, opts = {}) {
  const cache = new LRU({
    // This is just a default; in practice we should always pass our own TTL
    maxAge: "maxAge" in opts ? opts.maxAge : 10000,
    // We never want to evict anything that has not hit its age limit
    max: "max" in opts ? opts.max : Infinity,
    length: (promise) => (promise._byteLength || 1000) * 2 + 10000,
  });

  cache.pruneInterval = setInterval(() => {
    cache.prune();
  }, PRUNE_INTERVAL);

  const memoized = (key, maxAge, ...args) => {
    const fromCache = cache.get(key);

    if (fromCache !== undefined) {
      const cacheStatus = typeof fromCache._isFulfilled !== "undefined" ? "hit" : "wait";
      return { result: fromCache, cacheStatus };
    }

    const result = fn(...args);

    cache.set(key, result, REQUEST_TTL);

    // We need to _re-set_ the cache when our promise resolves, so that the TTL goes
    // from the time the origin request finishes, rather than just when it starts
    allSettled([result]).then(([promise]) => {
      result._isFulfilled = true;
      result._byteLength = promise.value && promise.value.body && promise.value.body.byteLength;

      if (promise.status === "rejected") {
        maxAge = Math.min(maxAge, MAX_FAILURE_TTL);
      }

      cache.set(key, result, maxAge);
    });

    // Decorate the promise so that we know whether this function call generated
    // a new promise or used an existing one. Note that we don't care about whether
    // or not the promise was resolved, just that it already existed.
    const cacheStatus = "miss";
    return { result, cacheStatus };
  };

  if (IS_TESTING) {
    memoizedFunctions.add(cache);
  }

  return memoized;
};

exports.clearMemoizationCache = function clearMemoizationCache() {
  if (!IS_TESTING) {
    throw new Error("Cache clearing only available in testing mode");
  }

  for (const cache of memoizedFunctions) {
    cache.reset();
  }
};
