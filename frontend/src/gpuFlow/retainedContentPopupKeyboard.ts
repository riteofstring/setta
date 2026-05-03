import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentPopupChoice,
  GpuRetainedContentRow,
} from "./retainedContentScene";
import type { GpuFlowScene } from "./scene";

type GpuRetainedContentChoicePopupKind = "color-picker" | "dropdown";

type GpuRetainedContentChoicePopupKeyboardTarget = {
  readonly highlightedOptionIndex?: number | null | undefined;
  readonly kind: GpuRetainedContentChoicePopupKind;
  readonly ownerRowId: string;
  readonly surfaceId: string;
};

type GpuRetainedContentChoicePopupKeyboardCommand =
  | { readonly kind: "commit" }
  | { readonly direction: -1 | 1; readonly kind: "move" }
  | { readonly kind: "end" }
  | { readonly kind: "start" }
  | { readonly kind: "typeahead"; readonly query: string };

type GpuRetainedContentChoicePopupKeyboardResult =
  | { readonly handled: false }
  | {
      readonly action: "highlight";
      readonly handled: true;
      readonly target: GpuRetainedContentChoicePopupKeyboardTarget;
    }
  | {
      readonly action: "commit";
      readonly handled: true;
      readonly option: GpuRetainedContentPopupChoice;
      readonly optionIndex: number;
      readonly optionValue: string;
      readonly target: GpuRetainedContentChoicePopupKeyboardTarget;
    };

type GpuRetainedContentChoicePopupControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: GpuRetainedContentChoicePopupKind }
>;

type GpuRetainedContentChoicePopupRow = GpuRetainedContentRow & {
  readonly control: GpuRetainedContentChoicePopupControl;
};

export function getGpuRetainedContentChoicePopupKeyboardCommand(
  event: Pick<KeyboardEvent, "key">,
  typeaheadQuery = "",
): GpuRetainedContentChoicePopupKeyboardCommand | null {
  if (event.key === "ArrowDown") {
    return { direction: 1, kind: "move" };
  }
  if (event.key === "ArrowUp") {
    return { direction: -1, kind: "move" };
  }
  if (event.key === "Home") {
    return { kind: "start" };
  }
  if (event.key === "End") {
    return { kind: "end" };
  }
  if (event.key === "Enter") {
    return { kind: "commit" };
  }
  if (typeaheadQuery) {
    return { kind: "typeahead", query: typeaheadQuery };
  }
  return null;
}

export function resolveGpuRetainedContentChoicePopupKeyboard({
  command,
  scene,
  target,
}: {
  readonly command: GpuRetainedContentChoicePopupKeyboardCommand;
  readonly scene: GpuFlowScene;
  readonly target: GpuRetainedContentChoicePopupKeyboardTarget | null;
}): GpuRetainedContentChoicePopupKeyboardResult {
  const context = getGpuRetainedContentChoicePopupContext({ scene, target });
  if (!context) {
    return { handled: false };
  }
  const currentIndex = getGpuRetainedContentChoicePopupCurrentIndex({
    row: context.row,
    target: context.target,
  });
  if (command.kind === "commit") {
    return createGpuRetainedContentChoicePopupCommitResult({
      optionIndex: currentIndex,
      row: context.row,
      target: context.target,
    });
  }
  const nextIndex = resolveGpuRetainedContentChoicePopupNextIndex({
    command,
    currentIndex,
    row: context.row,
  });
  if (nextIndex === null) {
    if (command.kind !== "typeahead") {
      return { handled: false };
    }
    return {
      action: "highlight",
      handled: true,
      target: createGpuRetainedContentChoicePopupTarget({
        optionIndex: currentIndex,
        target: context.target,
      }),
    };
  }
  return {
    action: "highlight",
    handled: true,
    target: createGpuRetainedContentChoicePopupTarget({
      optionIndex: nextIndex,
      target: context.target,
    }),
  };
}

function getGpuRetainedContentChoicePopupContext({
  scene,
  target,
}: {
  readonly scene: GpuFlowScene;
  readonly target: GpuRetainedContentChoicePopupKeyboardTarget | null;
}): {
  readonly row: GpuRetainedContentChoicePopupRow;
  readonly target: GpuRetainedContentChoicePopupKeyboardTarget;
} | null {
  if (!target) {
    return null;
  }
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === target.surfaceId,
  );
  if (
    !surface ||
    surface.renderer.kind !== "canvas-content" ||
    !surface.retainedScene
  ) {
    return null;
  }
  const row = surface.retainedScene.rows.find(
    (candidate) => candidate.id === target.ownerRowId,
  );
  if (
    !row?.control ||
    row.control.kind !== target.kind ||
    row.control.choices.length === 0
  ) {
    return null;
  }
  return {
    row: row as GpuRetainedContentChoicePopupRow,
    target,
  };
}

function getGpuRetainedContentChoicePopupCurrentIndex({
  row,
  target,
}: {
  readonly row: GpuRetainedContentChoicePopupRow;
  readonly target: GpuRetainedContentChoicePopupKeyboardTarget;
}): number {
  return clampInteger(
    target.highlightedOptionIndex ?? row.control.selectedIndex ?? 0,
    0,
    row.control.choices.length - 1,
  );
}

function resolveGpuRetainedContentChoicePopupNextIndex({
  command,
  currentIndex,
  row,
}: {
  readonly command: Exclude<
    GpuRetainedContentChoicePopupKeyboardCommand,
    { kind: "commit" }
  >;
  readonly currentIndex: number;
  readonly row: GpuRetainedContentChoicePopupRow;
}): number | null {
  const maxIndex = row.control.choices.length - 1;
  if (command.kind === "move") {
    return clampInteger(currentIndex + command.direction, 0, maxIndex);
  }
  if (command.kind === "start") {
    return 0;
  }
  if (command.kind === "end") {
    return maxIndex;
  }
  return getGpuRetainedContentChoicePopupTypeaheadIndex({
    choices: row.control.choices,
    currentIndex,
    query: command.query,
  });
}

function createGpuRetainedContentChoicePopupCommitResult({
  optionIndex,
  row,
  target,
}: {
  readonly optionIndex: number;
  readonly row: GpuRetainedContentChoicePopupRow;
  readonly target: GpuRetainedContentChoicePopupKeyboardTarget;
}): GpuRetainedContentChoicePopupKeyboardResult {
  const option = row.control.choices[optionIndex];
  if (!option) {
    return { handled: false };
  }
  return {
    action: "commit",
    handled: true,
    option,
    optionIndex,
    optionValue: getGpuRetainedContentChoicePopupOptionValue(option),
    target: createGpuRetainedContentChoicePopupTarget({
      optionIndex,
      target,
    }),
  };
}

function createGpuRetainedContentChoicePopupTarget({
  optionIndex,
  target,
}: {
  readonly optionIndex: number;
  readonly target: GpuRetainedContentChoicePopupKeyboardTarget;
}): GpuRetainedContentChoicePopupKeyboardTarget {
  return {
    highlightedOptionIndex: optionIndex,
    kind: target.kind,
    ownerRowId: target.ownerRowId,
    surfaceId: target.surfaceId,
  };
}

function getGpuRetainedContentChoicePopupTypeaheadIndex({
  choices,
  currentIndex,
  query,
}: {
  readonly choices: readonly GpuRetainedContentPopupChoice[];
  readonly currentIndex: number;
  readonly query: string;
}): number | null {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return null;
  }
  for (let offset = 1; offset <= choices.length; offset += 1) {
    const choiceIndex = (currentIndex + offset) % choices.length;
    const choice = choices[choiceIndex];
    if (
      choice &&
      getGpuRetainedContentChoicePopupSearchTexts(choice).some((text) =>
        text.toLocaleLowerCase().startsWith(normalizedQuery),
      )
    ) {
      return choiceIndex;
    }
  }
  return null;
}

function getGpuRetainedContentChoicePopupSearchTexts(
  choice: GpuRetainedContentPopupChoice,
): readonly string[] {
  if ("color" in choice) {
    return [choice.description, choice.color].filter(Boolean);
  }
  return [choice.label, choice.value].filter(Boolean);
}

function getGpuRetainedContentChoicePopupOptionValue(
  option: GpuRetainedContentPopupChoice,
): string {
  return "color" in option ? option.color : option.value;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
