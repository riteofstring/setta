/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  closeWorkspaceNavigator,
  getWorkspaceNavigatorStore,
  hasWorkspaceNavigatorSurface,
  openWorkspaceNavigator,
  registerWorkspaceNavigatorSurface,
  setWorkspaceNavigatorActiveIndex,
  setWorkspaceNavigatorMode,
  setWorkspaceNavigatorQuery,
} from "./workspaceNavigatorState";

const hosts: Array<WorkspaceHost> = [];

function createHost(): WorkspaceHost {
  const host = createWorkspaceHost();
  hosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.dispose();
  }
  document.body.replaceChildren();
});

describe("workspace navigator state", () => {
  it("keeps modal state and focus restoration inside its owning host", () => {
    const alpha = createHost();
    const beta = createHost();
    const alphaOpener = document.createElement("button");
    const betaOpener = document.createElement("button");
    document.body.append(alphaOpener, betaOpener);

    alphaOpener.focus();
    openWorkspaceNavigator(alpha, "find");

    expect(getWorkspaceNavigatorStore(alpha).getState()).toMatchObject({
      isOpen: true,
      mode: "find",
      opener: alphaOpener,
    });
    expect(getWorkspaceNavigatorStore(beta).getState().isOpen).toBe(false);

    betaOpener.focus();
    openWorkspaceNavigator(beta, "commands");
    closeWorkspaceNavigator(alpha);

    expect(document.activeElement).toBe(alphaOpener);
    expect(getWorkspaceNavigatorStore(alpha).getState().isOpen).toBe(false);
    expect(getWorkspaceNavigatorStore(beta).getState()).toMatchObject({
      isOpen: true,
      mode: "commands",
      opener: betaOpener,
    });
  });

  it("resets transient navigation when mode or query changes", () => {
    const host = createHost();

    openWorkspaceNavigator(host, "find");
    setWorkspaceNavigatorActiveIndex(host, 3);
    setWorkspaceNavigatorQuery(host, "invoice");

    expect(getWorkspaceNavigatorStore(host).getState()).toMatchObject({
      activeIndex: 0,
      mode: "find",
      query: "invoice",
    });

    setWorkspaceNavigatorActiveIndex(host, 2);
    setWorkspaceNavigatorMode(host, "commands");

    expect(getWorkspaceNavigatorStore(host).getState()).toMatchObject({
      activeIndex: 0,
      mode: "commands",
      query: "",
    });
  });

  it("tracks mounted navigator surfaces independently by host", () => {
    const alpha = createHost();
    const beta = createHost();

    expect(hasWorkspaceNavigatorSurface(alpha)).toBe(false);
    expect(hasWorkspaceNavigatorSurface(beta)).toBe(false);

    const unregisterAlpha = registerWorkspaceNavigatorSurface(alpha);
    const unregisterAlphaAgain = registerWorkspaceNavigatorSurface(alpha);

    expect(hasWorkspaceNavigatorSurface(alpha)).toBe(true);
    expect(hasWorkspaceNavigatorSurface(beta)).toBe(false);

    unregisterAlpha();
    expect(hasWorkspaceNavigatorSurface(alpha)).toBe(true);

    unregisterAlphaAgain();
    unregisterAlphaAgain();
    expect(hasWorkspaceNavigatorSurface(alpha)).toBe(false);
  });
});
