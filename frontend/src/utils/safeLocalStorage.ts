type SafeLocalStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const adaptersByNamespace = new Map<string, SafeLocalStorageAdapter>();
const memoryFallbackByNamespace = new Map<string, Map<string, string>>();

function getMemoryFallback(namespace: string): Map<string, string> {
  let fallback = memoryFallbackByNamespace.get(namespace);
  if (fallback) {
    return fallback;
  }
  fallback = new Map<string, string>();
  memoryFallbackByNamespace.set(namespace, fallback);
  return fallback;
}

function createMemoryAdapter(namespace: string): SafeLocalStorageAdapter {
  const fallback = getMemoryFallback(namespace);
  return {
    getItem: (key) => fallback.get(key) ?? null,
    setItem: (key, value) => {
      fallback.set(key, value);
    },
    removeItem: (key) => {
      fallback.delete(key);
    },
  };
}

export function getSafeLocalStorageAdapter(
  namespace: string,
): SafeLocalStorageAdapter {
  const cached = adaptersByNamespace.get(namespace);
  if (cached) {
    return cached;
  }

  const fallback = getMemoryFallback(namespace);
  if (typeof window === "undefined") {
    const adapter = createMemoryAdapter(namespace);
    adaptersByNamespace.set(namespace, adapter);
    return adapter;
  }

  try {
    const storage = window.localStorage;
    const probeKey = `setta.safeLocalStorage.${namespace}.__probe__`;
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    const adapter: SafeLocalStorageAdapter = {
      getItem: (key) => {
        try {
          return storage.getItem(key);
        } catch {
          return fallback.get(key) ?? null;
        }
      },
      setItem: (key, value) => {
        try {
          storage.setItem(key, value);
          fallback.delete(key);
        } catch {
          fallback.set(key, value);
        }
      },
      removeItem: (key) => {
        try {
          storage.removeItem(key);
        } catch {
          // Fall back to in-memory removal only.
        }
        fallback.delete(key);
      },
    };
    adaptersByNamespace.set(namespace, adapter);
    return adapter;
  } catch {
    const adapter = createMemoryAdapter(namespace);
    adaptersByNamespace.set(namespace, adapter);
    return adapter;
  }
}
