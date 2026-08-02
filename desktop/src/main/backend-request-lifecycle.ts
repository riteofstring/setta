import type { BackendFetch } from "@shared/backend-runtime";

export function createBackendRequestLifecycle() {
  let stopping = false;
  let activeRequestCount = 0;
  let idleResolvers: Array<() => void> = [];

  function setStopping(nextStopping: boolean) {
    stopping = nextStopping;
  }

  function wrapFetch(fetchImpl: BackendFetch): BackendFetch {
    return async (input, init) => {
      if (stopping) {
        throw new Error("backend is stopping");
      }
      activeRequestCount += 1;
      try {
        return await fetchImpl(input, init);
      } finally {
        activeRequestCount -= 1;
        if (activeRequestCount === 0) {
          const resolvers = idleResolvers;
          idleResolvers = [];
          for (const resolveIdle of resolvers) {
            resolveIdle();
          }
        }
      }
    };
  }

  async function waitForIdle(timeoutMs: number) {
    if (activeRequestCount === 0) {
      return;
    }
    let timeout: NodeJS.Timeout | null = null;
    await Promise.race([
      new Promise<void>((resolve) => {
        idleResolvers.push(resolve);
      }),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  return {
    setStopping,
    waitForIdle,
    wrapFetch,
  };
}
