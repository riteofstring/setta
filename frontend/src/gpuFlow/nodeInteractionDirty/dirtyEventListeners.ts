import {
  getGpuFlowNodeDirtyEventDetail,
  GPU_FLOW_NODE_DIRTY_EVENT,
} from "../nodeDirtyEvents";

import type { DirtyNodeReason, NodeTexturePriority } from "../dirtyTracking";

import { findGpuNodeIdForEventTarget } from "./nodeTargetLookup";

import type { DirtyEventKind } from "./interactionTypes";

type CustomDirtyEventDetail = {
  readonly animated?: boolean | undefined;
  readonly priority?: NodeTexturePriority | undefined;
  readonly reason?: DirtyNodeReason | undefined;
};

export function attachGpuNodeDirtyEventListeners({
  beginAnimationCaptureLease,
  canvas,
  elementByNodeId,
  handleFocusOut,
  listenerOptions,
  markCustomDirtyEvent,
  markEventTargetDirty,
  settleAnimationCaptureLease,
  shouldSkipDirty,
}: {
  readonly beginAnimationCaptureLease: (
    nodeId: string,
    eventTarget: EventTarget | null,
  ) => void;
  readonly canvas: HTMLElement;
  readonly elementByNodeId: () => ReadonlyMap<string, HTMLElement>;
  readonly handleFocusOut: (event: FocusEvent) => void;
  readonly listenerOptions: AddEventListenerOptions;
  readonly markCustomDirtyEvent: (
    eventTarget: EventTarget | null,
    detail: CustomDirtyEventDetail,
  ) => void;
  readonly markEventTargetDirty: (
    eventTarget: EventTarget | null,
    kind: DirtyEventKind,
  ) => void;
  readonly settleAnimationCaptureLease: (
    eventTarget: EventTarget | null,
  ) => void;
  readonly shouldSkipDirty: (event: Event) => boolean;
}) {
  canvas.addEventListener(
    GPU_FLOW_NODE_DIRTY_EVENT,
    (event) => {
      if (shouldSkipDirty(event)) {
        return;
      }
      const detail = getGpuFlowNodeDirtyEventDetail(event);
      if (detail) {
        markCustomDirtyEvent(event.target, detail);
      }
    },
    listenerOptions,
  );
  for (const type of ["transitionrun", "transitionstart", "animationstart"]) {
    canvas.addEventListener(
      type,
      (event) => {
        if (shouldSkipDirty(event)) {
          return;
        }
        const nodeId = findGpuNodeIdForEventTarget(
          event.target,
          elementByNodeId(),
        );
        if (nodeId) {
          beginAnimationCaptureLease(nodeId, event.target);
        }
      },
      listenerOptions,
    );
  }
  for (const type of [
    "transitionend",
    "transitioncancel",
    "animationend",
    "animationcancel",
  ]) {
    canvas.addEventListener(
      type,
      (event) => {
        if (!shouldSkipDirty(event)) {
          settleAnimationCaptureLease(event.target);
        }
      },
      listenerOptions,
    );
  }
  for (const type of ["beforeinput", "input", "change"]) {
    canvas.addEventListener(
      type,
      (event) => {
        if (!shouldSkipDirty(event)) {
          markEventTargetDirty(event.target, "input");
        }
      },
      listenerOptions,
    );
  }
  canvas.addEventListener(
    "scroll",
    (event) => {
      if (!shouldSkipDirty(event)) {
        markEventTargetDirty(event.target, "scroll");
      }
    },
    listenerOptions,
  );
  canvas.addEventListener(
    "focusin",
    (event) => {
      if (!shouldSkipDirty(event)) {
        markEventTargetDirty(event.target, "focus");
      }
    },
    listenerOptions,
  );
  canvas.addEventListener(
    "focusout",
    (event) => {
      if (!shouldSkipDirty(event)) {
        handleFocusOut(event);
      }
    },
    listenerOptions,
  );
}
