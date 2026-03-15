import type { HandlePosition, HandleType } from "forks/xyflow/core/types";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

export type SectionRefsState = {
  withNested: Record<string, HTMLElement | undefined>;
  selfOnly: Record<string, HTMLElement | undefined>;
};

function createDefaultSectionRefsState(): SectionRefsState {
  return {
    withNested: {},
    selfOnly: {},
  };
}

export const useSectionRefs = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      immer(
        withResetFn<SectionRefsState>(() => createDefaultSectionRefsState()),
      ),
    ),
  ),
);

export type EdgeHandleRecord = {
  sectionId: string;
  portId: string;
  type: HandleType;
  side: HandlePosition;
  element: HTMLElement | null;
};

type EdgeHandlePosition = {
  sectionId: string;
  portId: string;
  type: HandleType;
  side: HandlePosition;
  x: number;
  y: number;
};

type EdgeHandleRegistryState = {
  handles: Record<string, EdgeHandleRecord>;
  positions: Record<string, EdgeHandlePosition>;
};

function createDefaultEdgeHandleRegistryState(): EdgeHandleRegistryState {
  return {
    handles: {},
    positions: {},
  };
}

export const useEdgeHandleRegistry = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<EdgeHandleRegistryState>(() =>
        createDefaultEdgeHandleRegistryState(),
      ),
    ),
  ),
);

export type TemporaryMiscState = Record<string, unknown>;

export const useTemporaryMiscState = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(withResetFn<TemporaryMiscState>(() => ({}))),
  ),
);

export type LayoutMiscState = {
  isPanScrolling: boolean;
  lastMouseDownLocation: { x: number; y: number } | null;
  lastMouseUpLocation: { x: number; y: number } | null;
  mouseDownDrawArea: boolean;
  mouseDownDraggingSection: boolean;
  lastPaneClickLocation: { x: number; y: number };
  undoOrRedoWasTriggered: boolean;
  isSelectingParams: boolean;
  numDisplayedCodeAreas: number;
  numInitializedCodeAreas: number;
  requestUpdateNodeDimensions: boolean;
  updateAllDrawAreas: number;
  updateDrawArea: Record<string, number>;
  projectChatTrackedGitPaneGraphWindowInstanceId: string | null;
  projectChatGitGraphEmbeddedPaneVisibleByInstanceId: Record<string, true>;
};

function createDefaultLayoutMiscState(): LayoutMiscState {
  return {
    isPanScrolling: false,
    lastMouseDownLocation: null,
    lastMouseUpLocation: null,
    mouseDownDrawArea: false,
    mouseDownDraggingSection: false,
    lastPaneClickLocation: { x: 0, y: 0 },
    undoOrRedoWasTriggered: false,
    isSelectingParams: false,
    numDisplayedCodeAreas: 0,
    numInitializedCodeAreas: 0,
    requestUpdateNodeDimensions: false,
    updateAllDrawAreas: 0,
    updateDrawArea: {},
    projectChatTrackedGitPaneGraphWindowInstanceId: null,
    projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {},
  };
}

export const useMisc = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      withResetFn<LayoutMiscState>(() => createDefaultLayoutMiscState()),
    ),
  ),
);
