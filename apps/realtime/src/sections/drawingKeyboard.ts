export type DrawingKeyboardTool = "draw" | "erase" | "highlighter" | "select";

export type DrawingKeyboardAction =
  | { type: "clear-selection" }
  | { type: "copy-selection" }
  | { type: "delete-selection" }
  | { type: "duplicate-selection" }
  | { type: "group-selection" }
  | { type: "nudge-selection"; x: number; y: number }
  | { type: "paste" }
  | { type: "redo" }
  | { type: "select-all" }
  | { tool: DrawingKeyboardTool; type: "set-tool" }
  | { type: "undo" }
  | { type: "ungroup-selection" };

export type DrawingKeyboardAvailability = Readonly<{
  activeTool: DrawingKeyboardTool;
  canClearSelection: boolean;
  canCopySelection: boolean;
  canDeleteSelection: boolean;
  canDuplicateSelection: boolean;
  canGroupSelection: boolean;
  canNudgeSelection: boolean;
  canPaste: boolean;
  canRedo: boolean;
  canSelectAll: boolean;
  canSetTool: boolean;
  canUndo: boolean;
  canUngroupSelection: boolean;
}>;

export type DrawingKeyboardEvent = Readonly<
  Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target"
  >
>;

export type DrawingKeyboardContext = Readonly<{
  availability: DrawingKeyboardAvailability;
  fabricTextEditing: boolean;
  macOS: boolean;
}>;

const TOOL_BY_KEY: Readonly<Record<string, DrawingKeyboardTool>> = {
  e: "erase",
  h: "highlighter",
  p: "draw",
  v: "select",
};

const NUDGE_BY_KEY: Readonly<
  Record<string, Readonly<{ x: number; y: number }>>
> = {
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const contentEditable = target.closest<HTMLElement>("[contenteditable]");
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    (contentEditable !== null &&
      contentEditable.getAttribute("contenteditable")?.toLowerCase() !==
        "false")
  );
}

function hasExactMod(
  event: DrawingKeyboardEvent,
  macOS: boolean,
  shiftKey: boolean,
): boolean {
  return (
    !event.altKey &&
    event.shiftKey === shiftKey &&
    (macOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  );
}

function hasNoModifiers(event: DrawingKeyboardEvent): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function hasOnlyShift(event: DrawingKeyboardEvent): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && event.shiftKey;
}

function resolveModifiedAction(
  event: DrawingKeyboardEvent,
  context: DrawingKeyboardContext,
  key: string,
): DrawingKeyboardAction | null {
  const { availability } = context;
  if (hasExactMod(event, context.macOS, false)) {
    switch (key) {
      case "a":
        return availability.canSelectAll ? { type: "select-all" } : null;
      case "c":
        return availability.canCopySelection
          ? { type: "copy-selection" }
          : null;
      case "d":
        return availability.canDuplicateSelection
          ? { type: "duplicate-selection" }
          : null;
      case "g":
        return availability.canGroupSelection
          ? { type: "group-selection" }
          : null;
      case "v":
        return availability.canPaste ? { type: "paste" } : null;
      case "z":
        return availability.canUndo ? { type: "undo" } : null;
    }
  }
  if (hasExactMod(event, context.macOS, true)) {
    if (key === "g") {
      return availability.canUngroupSelection
        ? { type: "ungroup-selection" }
        : null;
    }
    if (key === "z") {
      return availability.canRedo ? { type: "redo" } : null;
    }
  }
  if (
    key === "y" &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
    return availability.canRedo ? { type: "redo" } : null;
  }
  return null;
}

function resolveUnmodifiedAction(
  event: DrawingKeyboardEvent,
  availability: DrawingKeyboardAvailability,
  key: string,
): DrawingKeyboardAction | null {
  const nudge = NUDGE_BY_KEY[event.key];
  if (nudge !== undefined && (hasNoModifiers(event) || hasOnlyShift(event))) {
    const distance = event.shiftKey ? 10 : 1;
    return availability.canNudgeSelection
      ? {
          type: "nudge-selection",
          x: nudge.x * distance,
          y: nudge.y * distance,
        }
      : null;
  }
  if (!hasNoModifiers(event)) {
    return null;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    return availability.canDeleteSelection
      ? { type: "delete-selection" }
      : null;
  }
  if (event.key === "Escape") {
    return availability.canClearSelection ? { type: "clear-selection" } : null;
  }
  const tool = TOOL_BY_KEY[key];
  return tool !== undefined &&
    availability.canSetTool &&
    availability.activeTool !== tool
    ? { tool, type: "set-tool" }
    : null;
}

export function resolveDrawingKeyboardAction(
  event: DrawingKeyboardEvent,
  context: DrawingKeyboardContext,
): DrawingKeyboardAction | null {
  if (context.fabricTextEditing || isEditableTarget(event.target)) {
    return null;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return (
    resolveModifiedAction(event, context, key) ??
    resolveUnmodifiedAction(event, context.availability, key)
  );
}
