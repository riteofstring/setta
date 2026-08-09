import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  deactivateDnd,
  forceDeactivateDnd,
  getDndSectionId,
  isTempSection,
  setActiveDnd,
  setDndDisabled,
  setDndTime,
  useDndState,
} from "./dndState";

describe("dndState", () => {
  beforeEach(() => {
    resetProjectStores();
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
    setActiveDnd("section-1", true, 300, 180, {
      top: 10,
      left: 20,
      right: 320,
      bottom: 190,
      width: 300,
      height: 180,
    });

    const state = useDndState.getState();
    expect(state.activeId).toBe("section-1");
    expect(state.activeIsTopLevel).toBe(true);
    expect(state.width).toBe(300);
    expect(state.height).toBe(180);
    expect(state.activeRect?.top).toBe(10);
  });

  it("switches between sorting and free-move modes", () => {
    // Validates mode toggles are mutually exclusive and clear pending deactivation.
    activateDndSortingMode();
    let state = useDndState.getState();
    expect(state.isSorting).toBe(true);
    expect(state.isMovingFree).toBe(false);

    activateDndMovingFreeMode();
    state = useDndState.getState();
    expect(state.isSorting).toBe(false);
    expect(state.isMovingFree).toBe(true);
    expect(state.pendingDeactivation).toBe(false);
  });

  it("marks pending deactivation only while a drag mode is active", () => {
    // Validates idle deactivation is ignored and active mode deactivation is queued.
    deactivateDnd();
    expect(useDndState.getState().pendingDeactivation).toBe(false);

    activateDndMovingFreeMode();
    deactivateDnd();
    expect(useDndState.getState().pendingDeactivation).toBe(true);
  });

  it("resets drag state while preserving disabled map", () => {
    // Validates hard reset keeps section-specific disabled settings.
    setDndDisabled("section-1", { draggable: true, droppable: false });
    setActiveDnd("section-1", false, 200, 120, {
      top: 0,
      left: 0,
      right: 200,
      bottom: 120,
      width: 200,
      height: 120,
    });
    activateDndSortingMode();

    forceDeactivateDnd();

    const state = useDndState.getState();
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
    setDndTime("section-1");
    const time = useDndState.getState().times["section-1"];
    expect(typeof time).toBe("number");
  });
});
