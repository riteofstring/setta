import { createStore } from "zustand/vanilla";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost.js";
import { createHostStoreGetter } from "./hostStore.js";

const hosts: WorkspaceHost[] = [];

function createHost() {
  const host = createWorkspaceHost();
  hosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
});

describe("host stores", () => {
  it("retains state and subscriptions independently for each host and store", () => {
    const getCounter = createHostStoreGetter(() =>
      createStore(() => ({ count: 0 })),
    );
    const getOtherCounter = createHostStoreGetter(() =>
      createStore(() => ({ count: 0 })),
    );
    const first = createHost();
    const second = createHost();
    const observedFirst: number[] = [];
    const observedSecond: number[] = [];
    getCounter(first).subscribe((state) => observedFirst.push(state.count));
    getCounter(second).subscribe((state) => observedSecond.push(state.count));

    getCounter(first).setState({ count: 1 });

    expect(getCounter(first).getState().count).toBe(1);
    expect(getCounter(second).getState().count).toBe(0);
    expect(getOtherCounter(first).getState().count).toBe(0);
    expect(observedFirst).toEqual([1]);
    expect(observedSecond).toEqual([]);
  });

  it.each([false, true])(
    "rejects a disposed host with initialized=%s",
    (initialized) => {
      const getCounter = createHostStoreGetter(() =>
        createStore(() => ({ count: 0 })),
      );
      const host = createHost();
      if (initialized) getCounter(host).setState({ count: 1 });
      host.dispose();

      expect(() => getCounter(host)).toThrow(
        "This workspace host has already been disposed.",
      );
    },
  );
});
