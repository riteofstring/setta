import type { WorkspaceHost } from "../workspaceHost.js";
import { assertWorkspaceHostActive } from "../workspaceHostInternals.js";

export function createHostStoreGetter<T extends object>(
  createStore: (host: WorkspaceHost) => T,
): (host: WorkspaceHost) => T {
  const stores = new WeakMap<WorkspaceHost, T>();
  return (host) => {
    assertWorkspaceHostActive(host);
    const existing = stores.get(host);
    if (existing) {
      return existing;
    }
    const store = createStore(host);
    stores.set(host, store);
    return store;
  };
}
