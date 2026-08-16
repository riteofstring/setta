import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorkspaceDocumentStore } from "../document/stores";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import { getDndChildrenStore } from "./dndChildren";
import { getDndSectionId, isTempSection } from "./dndIds";
import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  deactivateDnd,
  forceDeactivateDnd,
  setActiveDnd,
  setDndDisabled,
  setDndTime,
  getDndStateStore,
} from "./dndState";

describe("dndState", () => {
  let host: WorkspaceHost;

  beforeEach(() => {
    host = createWorkspaceHost();
    getDndStateStore(host).getState().reset();
    getDndChildrenStore(host).getState().reset();
    getWorkspaceDocumentStore(host).getState().reset();
  });

  afterEach(() => {
    host.dispose();
  });

  it("encodes and detects temporary dnd section ids", () => {
    // Validates temporary section id conventions used by placeholder logic.
    const tempId = getDndSectionId("section-1");
    expect(tempId).toBe("section-1-TempDND");
    expect(isTempSection(tempId)).toBe(true);
    expect(isTempSection("section-1")).toBe(false);
  });

  it("tracks active drag metadata", () => {
    // Validates drag start state fields are persisted in the shared store.
    setActiveDnd(host, "section-1", true, 300, 180, {
      top: 10,
      left: 20,
      right: 320,
      bottom: 190,
      width: 300,
      height: 180,
    });

    const state = getDndStateStore(host).getState();
    expect(state.activeId).toBe("section-1");
    expect(state.activeIsTopLevel).toBe(true);
    expect(state.width).toBe(300);
    expect(state.height).toBe(180);
    expect(state.activeRect?.top).toBe(10);
  });

  it("switches between sorting and free-move modes", () => {
    // Validates mode toggles are mutually exclusive and clear pending deactivation.
    activateDndSortingMode(host);
    let state = getDndStateStore(host).getState();
    expect(state.isSorting).toBe(true);
    expect(state.isMovingFree).toBe(false);

    activateDndMovingFreeMode(host);
    state = getDndStateStore(host).getState();
    expect(state.isSorting).toBe(false);
    expect(state.isMovingFree).toBe(true);
    expect(state.pendingDeactivation).toBe(false);
  });

  it("marks pending deactivation only while a drag mode is active", () => {
    // Validates idle deactivation is ignored and active mode deactivation is queued.
    deactivateDnd(host);
    expect(getDndStateStore(host).getState().pendingDeactivation).toBe(false);

    activateDndMovingFreeMode(host);
    deactivateDnd(host);
    expect(getDndStateStore(host).getState().pendingDeactivation).toBe(true);
  });

  it("resets drag state while preserving disabled map", () => {
    // Validates hard reset keeps section-specific disabled settings.
    setDndDisabled(host, "section-1", { draggable: true, droppable: false });
    setActiveDnd(host, "section-1", false, 200, 120, {
      top: 0,
      left: 0,
      right: 200,
      bottom: 120,
      width: 200,
      height: 120,
    });
    activateDndSortingMode(host);

    forceDeactivateDnd(host);

    const state = getDndStateStore(host).getState();
    expect(state.activeId).toBeNull();
    expect(state.isSorting).toBe(false);
    expect(state.isMovingFree).toBe(false);
    expect(state.disabled["section-1"]).toEqual({
      draggable: true,
      droppable: false,
    });
  });

  it("stores drag timestamps per section id", () => {
    // Validates drag timestamp bookkeeping for hover throttling checks.
    setDndTime(host, "section-1");
    const time = getDndStateStore(host).getState().times["section-1"];
    expect(typeof time).toBe("number");
  });
});
