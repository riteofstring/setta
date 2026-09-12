type DrawingKeyboardTool = "draw" | "erase" | "hand" | "highlighter" | "select";

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

type DrawingKeyboardCommandAction = Exclude<
  DrawingKeyboardAction,
  { type: "nudge-selection" } | { type: "set-tool" }
>;

type DrawingKeyboardCommandCapability = Exclude<
  keyof DrawingKeyboardAvailability,
  "activeTool"
>;

type DrawingModifiedActionSpec = Readonly<{
  action: DrawingKeyboardCommandAction;
  capability: DrawingKeyboardCommandCapability;
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

const MODIFIED_ACTION_BY_KEY: Readonly<
  Record<string, DrawingModifiedActionSpec>
> = {
  a: { action: { type: "select-all" }, capability: "canSelectAll" },
  c: {
    action: { type: "copy-selection" },
    capability: "canCopySelection",
  },
  d: {
    action: { type: "duplicate-selection" },
    capability: "canDuplicateSelection",
  },
  g: {
    action: { type: "group-selection" },
    capability: "canGroupSelection",
  },
  v: { action: { type: "paste" }, capability: "canPaste" },
  z: { action: { type: "undo" }, capability: "canUndo" },
};

const SHIFT_MODIFIED_ACTION_BY_KEY: Readonly<
  Record<string, DrawingModifiedActionSpec>
> = {
  g: {
    action: { type: "ungroup-selection" },
    capability: "canUngroupSelection",
  },
  z: { action: { type: "redo" }, capability: "canRedo" },
};

const CONTROL_Y_ACTION: DrawingModifiedActionSpec = {
  action: { type: "redo" },
  capability: "canRedo",
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

function isControlYChord(event: DrawingKeyboardEvent, key: string): boolean {
  return (
    key === "y" &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function resolveAvailableModifiedAction(
  spec: DrawingModifiedActionSpec | undefined,
  availability: DrawingKeyboardAvailability,
): DrawingKeyboardAction | null {
  if (spec === undefined || !availability[spec.capability]) {
    return null;
  }
  return spec.action;
}

function resolveModifiedAction(
  event: DrawingKeyboardEvent,
  context: DrawingKeyboardContext,
  key: string,
): DrawingKeyboardAction | null {
  const { availability } = context;
  if (isControlYChord(event, key)) {
    return resolveAvailableModifiedAction(CONTROL_Y_ACTION, availability);
  }
  if (hasExactMod(event, context.macOS, false)) {
    return resolveAvailableModifiedAction(
      MODIFIED_ACTION_BY_KEY[key],
      availability,
    );
  }
  if (hasExactMod(event, context.macOS, true)) {
    return resolveAvailableModifiedAction(
      SHIFT_MODIFIED_ACTION_BY_KEY[key],
      availability,
    );
  }
  return null;
}

function resolveNudgeAction(
  event: DrawingKeyboardEvent,
  availability: DrawingKeyboardAvailability,
): DrawingKeyboardAction | null {
  const nudge = NUDGE_BY_KEY[event.key];
  if (nudge === undefined) {
    return null;
  }
  if (!hasNoModifiers(event) && !hasOnlyShift(event)) {
    return null;
  }
  if (!availability.canNudgeSelection) {
    return null;
  }
  const distance = event.shiftKey ? 10 : 1;
  return {
    type: "nudge-selection",
    x: nudge.x * distance,
    y: nudge.y * distance,
  };
}

function resolveBareSelectionAction(
  key: string,
  availability: DrawingKeyboardAvailability,
): DrawingKeyboardAction | null {
  if (key === "Backspace" || key === "Delete") {
    return availability.canDeleteSelection
      ? { type: "delete-selection" }
      : null;
  }
  if (key === "Escape") {
    return availability.canClearSelection ? { type: "clear-selection" } : null;
  }
  return null;
}

function resolveBareToolAction(
  key: string,
  availability: DrawingKeyboardAvailability,
): DrawingKeyboardAction | null {
  const tool = TOOL_BY_KEY[key];
  return tool !== undefined &&
    availability.canSetTool &&
    availability.activeTool !== tool
    ? { tool, type: "set-tool" }
    : null;
}

function resolveUnmodifiedAction(
  event: DrawingKeyboardEvent,
  availability: DrawingKeyboardAvailability,
  key: string,
): DrawingKeyboardAction | null {
  const nudge = resolveNudgeAction(event, availability);
  if (nudge !== null) {
    return nudge;
  }
  if (!hasNoModifiers(event)) {
    return null;
  }
  return (
    resolveBareSelectionAction(key, availability) ??
    resolveBareToolAction(key, availability)
  );
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
