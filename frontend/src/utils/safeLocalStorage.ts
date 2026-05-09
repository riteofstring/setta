type SafeLocalStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const adaptersByNamespace = new Map<string, SafeLocalStorageAdapter>();
const overlayByNamespace = new Map<string, Map<string, string | null>>();

function getOverlay(namespace: string): Map<string, string | null> {
  let overlay = overlayByNamespace.get(namespace);
  if (overlay) {
    return overlay;
  }
  overlay = new Map<string, string | null>();
  overlayByNamespace.set(namespace, overlay);
  return overlay;
}

function createMemoryAdapter(namespace: string): SafeLocalStorageAdapter {
  const overlay = getOverlay(namespace);
  return {
    getItem: (key) => {
      if (!overlay.has(key)) {
        return null;
      }
      return overlay.get(key) ?? null;
    },
    setItem: (key, value) => {
      overlay.set(key, value);
    },
    removeItem: (key) => {
      overlay.set(key, null);
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

  const overlay = getOverlay(namespace);
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
        if (overlay.has(key)) {
          return overlay.get(key) ?? null;
        }
        try {
          return storage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        overlay.set(key, value);
        try {
          storage.setItem(key, value);
        } catch {}
      },
      removeItem: (key) => {
        overlay.set(key, null);
        try {
          storage.removeItem(key);
        } catch {
          // Keep adapter read-after-remove deterministic even if persistence fails.
        }
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
