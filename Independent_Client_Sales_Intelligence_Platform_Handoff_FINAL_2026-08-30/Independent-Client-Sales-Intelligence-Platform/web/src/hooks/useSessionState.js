import { useEffect, useState } from "react";

export default function useSessionState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored == null ? initialValue : JSON.parse(stored);
    } catch (_error) {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {
      // Ignore storage failures; the page still works with normal React state.
    }
  }, [key, value]);

  return [value, setValue];
}
