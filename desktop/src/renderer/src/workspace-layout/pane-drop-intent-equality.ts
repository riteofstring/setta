import type { PaneDropIntent } from "./types";

type IntentKind = PaneDropIntent["kind"];
type IntentByKind<TKind extends IntentKind> = Extract<PaneDropIntent, { kind: TKind }>;

export function samePaneDropIntent(
  left: PaneDropIntent | null,
  right: PaneDropIntent | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.kind !== right.kind) {
    return false;
  }
  return samePaneDropIntentByKind(left, right);
}

function samePaneDropIntentByKind(left: PaneDropIntent, right: PaneDropIntent): boolean {
  switch (left.kind) {
    case "column":
      return sameColumnDropIntent(left, right as IntentByKind<"column">);
    case "plane-slot":
      return samePlaneSlotDropIntent(left, right as IntentByKind<"plane-slot">);
    case "row":
      return sameRowDropIntent(left, right as IntentByKind<"row">);
    case "swap":
      return sameSwapDropIntent(left, right as IntentByKind<"swap">);
    default:
      return assertNever(left);
  }
}

function sameColumnDropIntent(
  left: IntentByKind<"column">,
  right: IntentByKind<"column">,
): boolean {
  return (
    left.targetColumnId === right.targetColumnId &&
    left.planeIndex === right.planeIndex &&
    left.slotPlacement === right.slotPlacement
  );
}

function samePlaneSlotDropIntent(
  left: IntentByKind<"plane-slot">,
  right: IntentByKind<"plane-slot">,
): boolean {
  return (
    left.planeIndex === right.planeIndex &&
    left.referenceColumnId === right.referenceColumnId &&
    left.slotIndex === right.slotIndex
  );
}

function sameRowDropIntent(left: IntentByKind<"row">, right: IntentByKind<"row">): boolean {
  return left.targetPaneId === right.targetPaneId && left.placement === right.placement;
}

function sameSwapDropIntent(left: IntentByKind<"swap">, right: IntentByKind<"swap">): boolean {
  return left.targetPaneId === right.targetPaneId;
}

function assertNever(value: never): never {
  throw new Error(`unhandled pane drop intent kind: ${JSON.stringify(value)}`);
}
