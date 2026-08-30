import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Route changes unmount page components in React Router. Keep a small in-memory cache so
// returning to a workspace does not flash a loading state or discard already-loaded data.
const dataCache = new Map();
const inFlight = new Map();

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
  const cacheKey = useMemo(
    () => options.cacheKey || `${loaderIdentity(loader)}::${dependencyKey}`,
    [dependencyKey, loader, options.cacheKey]
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
    if (cached) {
      setDataState(cached.data);
      setError(cached.error ?? null);
      setLoading(false);
      // Silent stale-while-revalidate: data stays visible while the latest copy is fetched.
      refresh({ showLoading: false }).catch(() => undefined);
    } else {
      refresh({ showLoading: true }).catch(() => undefined);
    }
  }, [cacheKey, refresh]);

  return { data, loading, error, refresh, setData };
}
