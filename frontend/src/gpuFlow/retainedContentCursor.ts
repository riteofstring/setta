import {
  hitTestGpuRetainedContentInteraction,
  type GpuRetainedContentInteractionHit,
} from "./interactions/retainedContentInteraction";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentHitRecord,
  GpuRetainedContentRow,
} from "./retainedContentScene";
import type { GpuFlowScene } from "./scene";
import type { GpuFlowViewportStoreApi } from "./viewportStore";

const GPU_RETAINED_CONTROL_CURSOR_BY_KIND = {
  button: "pointer",
  "color-picker": "pointer",
  "date-time": null,
  dropdown: "pointer",
  dropzone: "pointer",
  password: "text",
  rotary: "pointer",
  slider: "pointer",
  switch: "pointer",
  "text-like": "text",
} satisfies Record<GpuRetainedContentControlDescriptor["kind"], string | null>;

export function resolveGpuRetainedContentCursor({
  element,
  event,
  getScene,
  store,
}: {
  readonly element: HTMLElement;
  readonly event: PointerEvent;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly store: GpuFlowViewportStoreApi;
}): string | null {
  return resolveGpuRetainedContentHitCursor(
    hitTestGpuRetainedContentInteraction({
      element,
      event,
      getScene,
      store,
    }),
  );
}

export function resolveGpuRetainedContentHitCursor(
  hit: GpuRetainedContentInteractionHit | null | undefined,
): string | null {
  if (!hit) {
    return null;
  }
  if (isScrollbarHit(hit.hit)) {
    return "pointer";
  }

  const row = getGpuRetainedContentHitRow(hit);
  if (!row) {
    return null;
  }
  if (isControlRelatedHit(hit.hit) && row.state.disabled) {
    return "not-allowed";
  }
  return resolveGpuRetainedContentRowHitCursor(hit.hit, row);
}

function resolveGpuRetainedContentRowHitCursor(
  hit: GpuRetainedContentHitRecord,
  row: GpuRetainedContentRow,
): string | null {
  if (isPopupPointerHit(hit)) {
    return "pointer";
  }
  if (hit.kind === "control") {
    return row.control
      ? resolveGpuRetainedContentControlCursor(row.control)
      : null;
  }
  if (hit.kind === "control-subpart") {
    return resolveGpuRetainedContentControlSubpartCursor(hit, row);
  }
  return null;
}

function isScrollbarHit(hit: GpuRetainedContentHitRecord): boolean {
  return hit.kind === "scrollbar-thumb" || hit.kind === "scrollbar-track";
}

function isPopupPointerHit(hit: GpuRetainedContentHitRecord): boolean {
  return (
    hit.kind === "popup-date-cell" ||
    hit.kind === "popup-date-navigation" ||
    hit.kind === "popup-option"
  );
}

function isControlRelatedHit(hit: GpuRetainedContentHitRecord): boolean {
  return (
    hit.kind === "control" ||
    hit.kind === "control-subpart" ||
    hit.kind === "popup-date-cell" ||
    hit.kind === "popup-date-navigation" ||
    hit.kind === "popup-option"
  );
}

function resolveGpuRetainedContentControlCursor(
  control: GpuRetainedContentControlDescriptor,
): string {
  const cursor = GPU_RETAINED_CONTROL_CURSOR_BY_KIND[control.kind];
  if (cursor) {
    return cursor;
  }
  return control.commitPolicy === "native-island" ? "text" : "pointer";
}

function resolveGpuRetainedContentControlSubpartCursor(
  hit: GpuRetainedContentHitRecord,
  row: GpuRetainedContentRow,
): string | null {
  if (!row.control) {
    return null;
  }
  if (
    hit.subpartKind === "dropzone-attachment-delete" ||
    hit.subpartKind === "password-reveal"
  ) {
    return "pointer";
  }
  return resolveGpuRetainedContentControlCursor(row.control);
}

function getGpuRetainedContentHitRow(
  hit: GpuRetainedContentInteractionHit,
): GpuRetainedContentRow | undefined {
  return hit.retainedScene.rows.find(
    (candidate) => candidate.id === hit.hit.ownerRowId,
  );
}
