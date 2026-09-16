import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Route changes unmount page components in React Router. Keep a small in-memory cache so
// returning to a workspace does not flash a loading state or discard already-loaded data.
const dataCache = new Map();
const inFlight = new Map();
const DEFAULT_STALE_TIME_MS = 5 * 60 * 1000;

function serializeDependencies(dependencies) {
  try {
    return JSON.stringify(dependencies);
  } catch (_error) {
    return String(dependencies);
  }
}

function loaderIdentity(loader) {
  if (loader?.cacheKey) return String(loader.cacheKey);
  if (loader?.name) return loader.name;
  return String(loader);
}

export function clearAsyncDataCache(prefix = "") {
  [...dataCache.keys()].forEach((key) => {
    if (!prefix || key.startsWith(prefix)) dataCache.delete(key);
  });
}

export default function useAsyncData(loader, dependencies = [], options = {}) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const dependencyKey = serializeDependencies(dependencies);
  const optionCacheKey = options.cacheKey;
  const staleTimeMs = Number.isFinite(Number(options.staleTimeMs))
    ? Math.max(0, Number(options.staleTimeMs))
    : DEFAULT_STALE_TIME_MS;
  const revalidateOnMount = options.revalidateOnMount !== false;

  const cacheKey = useMemo(
    () => optionCacheKey || `${loaderIdentity(loader)}::${dependencyKey}`,
    [dependencyKey, loader, optionCacheKey]
  );

  const initialCached = dataCache.get(cacheKey);
  const [data, setDataState] = useState(initialCached?.data ?? null);
  const [loading, setLoading] = useState(!initialCached);
  const [error, setError] = useState(initialCached?.error ?? null);

  const setData = useCallback(
    (nextValue) => {
      setDataState((previousValue) => {
        const resolved = typeof nextValue === "function" ? nextValue(previousValue) : nextValue;
        dataCache.set(cacheKey, { data: resolved, error: null, updatedAt: Date.now() });
        return resolved;
      });
    },
    [cacheKey]
  );

  const refresh = useCallback(
    async (refreshOptions = {}) => {
      const cached = dataCache.get(cacheKey);
      const showLoading = refreshOptions.showLoading ?? !cached;

      if (showLoading) setLoading(true);
      setError(null);

      let request = inFlight.get(cacheKey);
      if (!request) {
        request = Promise.resolve().then(() => loaderRef.current());
        inFlight.set(cacheKey, request);
      }

      try {
        const result = await request;
        dataCache.set(cacheKey, { data: result, error: null, updatedAt: Date.now() });
        setDataState(result);
        return result;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        if (!cached) {
          setError(normalized);
          dataCache.set(cacheKey, { data: null, error: normalized, updatedAt: Date.now() });
        }
        throw normalized;
      } finally {
        if (inFlight.get(cacheKey) === request) inFlight.delete(cacheKey);
        setLoading(false);
      }
    },
    [cacheKey]
  );

  useEffect(() => {
    const cached = dataCache.get(cacheKey);

    if (!cached) {
      refresh({ showLoading: true }).catch(() => undefined);
      return;
    }

    setDataState(cached.data);
    setError(cached.error ?? null);
    setLoading(false);

    const ageMs = Math.max(0, Date.now() - Number(cached.updatedAt || 0));
    const isFresh = ageMs < staleTimeMs;

    // Route changes unmount/remount pages. Reuse fresh cached data without
    // making another Supabase request, so tab switches feel instant. Once the
    // cache is stale, keep the old data visible and refresh in the background.
    if (revalidateOnMount && !isFresh) {
      refresh({ showLoading: false }).catch(() => undefined);
    }
  }, [cacheKey, refresh, revalidateOnMount, staleTimeMs]);

  return { data, loading, error, refresh, setData };
}
