import type {
  GpuRetainedContentDrawCommand,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import type { GpuPoint, GpuRect } from "./viewportMath";

type GpuRetainedContentSwitchCommand = Extract<
  GpuRetainedContentDrawCommand,
  { kind: "row-control" }
> & {
  readonly control: { readonly checked: boolean; readonly kind: "switch" };
};

type GpuRetainedContentSwitchAnimationSurface = {
  readonly id: string;
  readonly rect: GpuRect;
  readonly retainedScene: GpuRetainedContentScene;
  readonly sourceClipOffset?: GpuPoint | undefined;
};

type GpuRetainedContentSwitchTransition = {
  readonly durationMs: number;
  readonly fromChecked: boolean;
  readonly fromProgress: number;
  readonly pendingSceneMatch: boolean;
  readonly protectFromCheckedUntilComplete: boolean;
  readonly rowId: string;
  readonly startedAtMs: number;
  readonly targetSceneMatchedAtMs?: number | undefined;
  readonly surfaceId: string;
  readonly toChecked: boolean;
  readonly toProgress: number;
};

type GpuRetainedContentSwitchAnimationStoreOptions = {
  readonly durationMs?: number | undefined;
  readonly prefersReducedMotion?: (() => boolean) | undefined;
};

export type GpuRetainedContentSwitchVisualState = {
  readonly progress: number;
  readonly targetChecked: boolean;
};

export type GpuRetainedContentSwitchAnimationStore = {
  beginTransition(input: {
    readonly fromChecked: boolean;
    readonly nowMs?: number | undefined;
    readonly rowId: string;
    readonly surfaceId: string;
    readonly toChecked: boolean;
  }): void;
  clear(): void;
  clearSurface(surfaceId: string): void;
  getActiveSurfaceSourceRect(
    surface: GpuRetainedContentSwitchAnimationSurface,
  ): GpuRect | undefined;
  getFreshnessProtectedSurfaceSourceRect(
    surface: GpuRetainedContentSwitchAnimationSurface,
  ): GpuRect | undefined;
  getFreshnessProtectedSurfaceRowIds(
    surface: GpuRetainedContentSwitchAnimationSurface,
  ): readonly string[];
  hasActiveSurface(surfaceId: string, nowMs?: number | undefined): boolean;
  hasActiveSwitch(input: {
    readonly nowMs?: number | undefined;
    readonly rowId: string;
    readonly surfaceId: string;
  }): boolean;
  resolveProgress(input: {
    readonly checked: boolean;
    readonly nowMs?: number | undefined;
    readonly rowId: string;
    readonly surfaceId: string;
  }): number;
  resolveVisualState(input: {
    readonly checked: boolean;
    readonly nowMs?: number | undefined;
    readonly rowId: string;
    readonly surfaceId: string;
  }): GpuRetainedContentSwitchVisualState;
  settleCompletedSurfaceTransitions(input: {
    readonly isRowFresh?: ((rowId: string) => boolean) | undefined;
    readonly nowMs?: number | undefined;
    readonly surface: GpuRetainedContentSwitchAnimationSurface;
  }): void;
  syncSurface(
    surface: GpuRetainedContentSwitchAnimationSurface,
    nowMs?: number | undefined,
  ): void;
};

export const DEFAULT_SWITCH_TRANSITION_DURATION_MS = 140;
const SWITCH_INTERACTION_TARGET_SCENE_SETTLE_DELAY_MS = 500;
const SWITCH_ANIMATION_KEY_SEPARATOR = "\u0000";

export function createGpuRetainedContentSwitchAnimationStore({
  durationMs = DEFAULT_SWITCH_TRANSITION_DURATION_MS,
  prefersReducedMotion = prefersGpuRetainedContentReducedMotion,
}: GpuRetainedContentSwitchAnimationStoreOptions = {}): GpuRetainedContentSwitchAnimationStore {
  const checkedByKey = new Map<string, boolean>();
  const progressByKey = new Map<string, number>();
  const surfaceKeys = new Map<string, Set<string>>();
  const transitions = new Map<string, GpuRetainedContentSwitchTransition>();

  const clearKey = (key: string) => {
    checkedByKey.delete(key);
    progressByKey.delete(key);
    transitions.delete(key);
  };

  const clearSurface = (surfaceId: string) => {
    const keys = surfaceKeys.get(surfaceId);
    if (!keys) {
      return;
    }
    for (const key of keys) {
      clearKey(key);
    }
    surfaceKeys.delete(surfaceId);
  };

  return {
    beginTransition({
      fromChecked,
      nowMs = getGpuRetainedContentSwitchNowMs(),
      rowId,
      surfaceId,
      toChecked,
    }) {
      const key = createSwitchAnimationKey(surfaceId, rowId);
      if (fromChecked === toChecked) {
        checkedByKey.set(key, toChecked);
        progressByKey.set(key, toChecked ? 1 : 0);
        transitions.delete(key);
        return;
      }
      setGpuRetainedContentSwitchTransition({
        durationMs,
        fromChecked,
        fromProgress: resolveGpuRetainedContentStoredSwitchProgress({
          checked: fromChecked,
          key,
          nowMs,
          progressByKey,
          transitions,
        }),
        key,
        nowMs,
        pendingSceneMatch: true,
        progressByKey,
        protectFromCheckedUntilComplete: true,
        reduceMotion: prefersReducedMotion(),
        rowId,
        surfaceId,
        toChecked,
        transitions,
      });
      checkedByKey.set(key, toChecked);
      addSurfaceKey(surfaceKeys, surfaceId, key);
    },
    clear() {
      checkedByKey.clear();
      progressByKey.clear();
      surfaceKeys.clear();
      transitions.clear();
    },
    clearSurface,
    getActiveSurfaceSourceRect(surface) {
      return getGpuRetainedContentSwitchTransitionSourceRect({
        isIncluded: ({ transition }) => Boolean(transition),
        surface,
        transitions,
      });
    },
    getFreshnessProtectedSurfaceSourceRect(surface) {
      return getGpuRetainedContentSwitchTransitionSourceRect({
        isIncluded: ({ command, transition }) =>
          Boolean(
            transition &&
              !transition.pendingSceneMatch &&
              transition.toChecked === command.control.checked,
          ),
        surface,
        transitions,
      });
    },
    getFreshnessProtectedSurfaceRowIds(surface) {
      return getGpuRetainedContentSwitchTransitionRowIds({
        isIncluded: ({ command, transition }) =>
          Boolean(
            transition &&
              !transition.pendingSceneMatch &&
              transition.toChecked === command.control.checked,
          ),
        surface,
        transitions,
      });
    },
    hasActiveSurface(surfaceId, nowMs = getGpuRetainedContentSwitchNowMs()) {
      const keys = surfaceKeys.get(surfaceId);
      if (!keys) {
        return false;
      }
      for (const key of keys) {
        if (
          isGpuRetainedContentSwitchAnimationKeyActive({
            checkedByKey,
            key,
            nowMs,
            progressByKey,
            transitions,
          })
        ) {
          return true;
        }
      }
      return false;
    },
    hasActiveSwitch({
      nowMs = getGpuRetainedContentSwitchNowMs(),
      rowId,
      surfaceId,
    }) {
      return isGpuRetainedContentSwitchAnimationKeyActive({
        checkedByKey,
        key: createSwitchAnimationKey(surfaceId, rowId),
        nowMs,
        progressByKey,
        transitions,
      });
    },
    resolveProgress({
      checked,
      nowMs = getGpuRetainedContentSwitchNowMs(),
      rowId,
      surfaceId,
    }) {
      return this.resolveVisualState({
        checked,
        nowMs,
        rowId,
        surfaceId,
      }).progress;
    },
    resolveVisualState({
      checked,
      nowMs = getGpuRetainedContentSwitchNowMs(),
      rowId,
      surfaceId,
    }) {
      const key = createSwitchAnimationKey(surfaceId, rowId);
      const transition = ensureGpuRetainedContentSwitchTransitionForChecked({
        checked,
        checkedByKey,
        durationMs,
        key,
        nowMs,
        prefersReducedMotion,
        progressByKey,
        rowId,
        surfaceId,
        transitions,
      });
      if (!transition) {
        const resolvedProgress = checked ? 1 : 0;
        progressByKey.set(key, resolvedProgress);
        return {
          progress: resolvedProgress,
          targetChecked: checked,
        };
      }
      const progress = clampUnit(
        (nowMs - transition.startedAtMs) / transition.durationMs,
      );
      if (progress >= 1) {
        progressByKey.set(key, transition.toProgress);
        return {
          progress: transition.toProgress,
          targetChecked: transition.toChecked,
        };
      }
      const resolvedProgress =
        transition.fromProgress +
        (transition.toProgress - transition.fromProgress) * progress;
      progressByKey.set(key, resolvedProgress);
      return {
        progress: resolvedProgress,
        targetChecked: transition.toChecked,
      };
    },
    settleCompletedSurfaceTransitions({
      isRowFresh,
      nowMs = getGpuRetainedContentSwitchNowMs(),
      surface,
    }) {
      const keys = surfaceKeys.get(surface.id);
      if (!keys) {
        return;
      }
      const commandByRowId = new Map(
        getGpuRetainedContentSwitchCommands(surface.retainedScene).map(
          (command) => [command.rowId, command],
        ),
      );
      for (const key of keys) {
        const transition = transitions.get(key);
        if (
          !transition ||
          transition.pendingSceneMatch ||
          !isGpuRetainedContentSwitchTransitionComplete(transition, nowMs)
        ) {
          continue;
        }
        if (
          isRowFresh &&
          !isGpuRetainedContentSwitchTransitionSourceFresh({
            command: commandByRowId.get(transition.rowId),
            isRowFresh,
            transition,
          })
        ) {
          continue;
        }
        transitions.delete(key);
        checkedByKey.set(key, transition.toChecked);
        progressByKey.set(key, transition.toProgress);
      }
    },
    syncSurface(surface, nowMs = getGpuRetainedContentSwitchNowMs()) {
      const nextKeys = new Set<string>();
      const reduceMotion = prefersReducedMotion();
      for (const command of getGpuRetainedContentSwitchCommands(
        surface.retainedScene,
      )) {
        syncGpuRetainedContentSwitchCommand({
          checkedByKey,
          command,
          durationMs,
          nextKeys,
          nowMs,
          progressByKey,
          reduceMotion,
          surfaceId: surface.id,
          transitions,
        });
      }

      removeMissingGpuRetainedContentSwitchKeys({
        clearKey,
        nextKeys,
        previousKeys: surfaceKeys.get(surface.id),
        transitions,
      });
      if (nextKeys.size === 0) {
        surfaceKeys.delete(surface.id);
      } else {
        surfaceKeys.set(surface.id, nextKeys);
      }
    },
  };
}

function ensureGpuRetainedContentSwitchTransitionForChecked({
  checked,
  checkedByKey,
  durationMs,
  key,
  nowMs,
  prefersReducedMotion,
  progressByKey,
  rowId,
  surfaceId,
  transitions,
}: {
  readonly checked: boolean;
  readonly checkedByKey: Map<string, boolean>;
  readonly durationMs: number;
  readonly key: string;
  readonly nowMs: number;
  readonly prefersReducedMotion: () => boolean;
  readonly progressByKey: Map<string, number>;
  readonly rowId: string;
  readonly surfaceId: string;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}): GpuRetainedContentSwitchTransition | undefined {
  const transition = transitions.get(key);
  const reusableTransition = resolveReusableSwitchTransition({
    checked,
    transition,
  });
  if (reusableTransition) {
    return reusableTransition;
  }
  const previousChecked = checkedByKey.get(key);
  if (
    shouldKeepSwitchWithoutTransition({ checked, previousChecked, transition })
  ) {
    return undefined;
  }
  const fromChecked = transition?.toChecked ?? previousChecked ?? checked;
  setGpuRetainedContentSwitchTransition({
    durationMs,
    fromChecked,
    fromProgress: resolveGpuRetainedContentStoredSwitchProgress({
      checked: fromChecked,
      key,
      nowMs,
      progressByKey,
      transitions,
    }),
    key,
    nowMs,
    pendingSceneMatch: false,
    progressByKey,
    protectFromCheckedUntilComplete: false,
    reduceMotion: prefersReducedMotion(),
    rowId,
    surfaceId,
    toChecked: checked,
    transitions,
  });
  checkedByKey.set(key, checked);
  return transitions.get(key);
}

function resolveReusableSwitchTransition({
  checked,
  transition,
}: {
  readonly checked: boolean;
  readonly transition: GpuRetainedContentSwitchTransition | undefined;
}): GpuRetainedContentSwitchTransition | undefined {
  if (!transition) {
    return undefined;
  }
  if (transition.toChecked === checked) {
    return transition;
  }
  if (
    (transition.pendingSceneMatch ||
      transition.protectFromCheckedUntilComplete) &&
    transition.fromChecked === checked
  ) {
    return transition;
  }
  return undefined;
}

function shouldKeepSwitchWithoutTransition({
  checked,
  previousChecked,
  transition,
}: {
  readonly checked: boolean;
  readonly previousChecked: boolean | undefined;
  readonly transition: GpuRetainedContentSwitchTransition | undefined;
}): boolean {
  if (transition) {
    return false;
  }
  return previousChecked === checked || previousChecked === undefined;
}

function syncGpuRetainedContentSwitchCommand({
  checkedByKey,
  command,
  durationMs,
  nextKeys,
  nowMs,
  progressByKey,
  reduceMotion,
  surfaceId,
  transitions,
}: {
  readonly checkedByKey: Map<string, boolean>;
  readonly command: GpuRetainedContentSwitchCommand;
  readonly durationMs: number;
  readonly nextKeys: Set<string>;
  readonly nowMs: number;
  readonly progressByKey: Map<string, number>;
  readonly reduceMotion: boolean;
  readonly surfaceId: string;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}) {
  const key = createSwitchAnimationKey(surfaceId, command.rowId);
  const checked = command.control.checked;
  nextKeys.add(key);
  const transition = transitions.get(key);
  if (shouldIgnoreSwitchSceneCommand(transition, checked)) {
    markSwitchTransitionSceneStale({
      key,
      transition,
      transitions,
    });
    return;
  }
  releaseSwitchTransitionSceneMatch({
    checked,
    key,
    nowMs,
    transition,
    transitions,
  });
  const previousChecked = checkedByKey.get(key);
  seedGpuRetainedContentSwitchProgress({
    checked,
    key,
    previousChecked,
    progressByKey,
  });
  if (previousChecked === undefined || previousChecked === checked) {
    checkedByKey.set(key, checked);
    return;
  }
  const fromProgress = resolveGpuRetainedContentStoredSwitchProgress({
    checked: previousChecked,
    key,
    nowMs,
    progressByKey,
    transitions,
  });
  setGpuRetainedContentSwitchTransition({
    durationMs,
    fromChecked: previousChecked,
    fromProgress,
    key,
    nowMs,
    pendingSceneMatch: false,
    progressByKey,
    protectFromCheckedUntilComplete: false,
    reduceMotion,
    rowId: command.rowId,
    surfaceId,
    toChecked: checked,
    transitions,
  });
  checkedByKey.set(key, checked);
}

function shouldIgnoreSwitchSceneCommand(
  transition: GpuRetainedContentSwitchTransition | undefined,
  checked: boolean,
): boolean {
  return Boolean(
    transition?.protectFromCheckedUntilComplete &&
      transition.fromChecked === checked,
  );
}

function releaseSwitchTransitionSceneMatch({
  checked,
  key,
  nowMs,
  transition,
  transitions,
}: {
  readonly checked: boolean;
  readonly key: string;
  readonly nowMs: number;
  readonly transition: GpuRetainedContentSwitchTransition | undefined;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}) {
  if (!transition?.pendingSceneMatch || transition.toChecked !== checked) {
    return;
  }
  transitions.set(key, {
    ...transition,
    pendingSceneMatch: false,
    targetSceneMatchedAtMs: transition.targetSceneMatchedAtMs ?? nowMs,
  });
}

function markSwitchTransitionSceneStale({
  key,
  transition,
  transitions,
}: {
  readonly key: string;
  readonly transition: GpuRetainedContentSwitchTransition | undefined;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}) {
  if (!transition?.protectFromCheckedUntilComplete) {
    return;
  }
  transitions.set(key, {
    ...transition,
    pendingSceneMatch: true,
    targetSceneMatchedAtMs: undefined,
  });
}

function seedGpuRetainedContentSwitchProgress({
  checked,
  key,
  previousChecked,
  progressByKey,
}: {
  readonly checked: boolean;
  readonly key: string;
  readonly previousChecked: boolean | undefined;
  readonly progressByKey: Map<string, number>;
}) {
  if (previousChecked !== undefined || progressByKey.has(key)) {
    return;
  }
  progressByKey.set(key, checked ? 1 : 0);
}

function setGpuRetainedContentSwitchTransition({
  durationMs,
  fromChecked,
  fromProgress,
  key,
  nowMs,
  pendingSceneMatch,
  progressByKey,
  protectFromCheckedUntilComplete,
  reduceMotion,
  rowId,
  surfaceId,
  toChecked,
  transitions,
}: {
  readonly durationMs: number;
  readonly fromChecked: boolean;
  readonly fromProgress: number;
  readonly key: string;
  readonly nowMs: number;
  readonly pendingSceneMatch: boolean;
  readonly progressByKey: Map<string, number>;
  readonly protectFromCheckedUntilComplete: boolean;
  readonly reduceMotion: boolean;
  readonly rowId: string;
  readonly surfaceId: string;
  readonly toChecked: boolean;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}) {
  if (reduceMotion) {
    transitions.delete(key);
    progressByKey.set(key, toChecked ? 1 : 0);
    return;
  }
  transitions.set(key, {
    durationMs,
    fromChecked,
    fromProgress,
    pendingSceneMatch,
    protectFromCheckedUntilComplete,
    rowId,
    startedAtMs: nowMs,
    surfaceId,
    toChecked,
    toProgress: toChecked ? 1 : 0,
  });
}

function resolveGpuRetainedContentStoredSwitchProgress({
  checked,
  key,
  nowMs,
  progressByKey,
  transitions,
}: {
  readonly checked: boolean;
  readonly key: string;
  readonly nowMs: number;
  readonly progressByKey: Map<string, number>;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}): number {
  const transition = transitions.get(key);
  if (!transition) {
    return progressByKey.get(key) ?? (checked ? 1 : 0);
  }
  const progress = clampUnit(
    (nowMs - transition.startedAtMs) / transition.durationMs,
  );
  const resolvedProgress =
    progress >= 1
      ? transition.toProgress
      : transition.fromProgress +
        (transition.toProgress - transition.fromProgress) * progress;
  progressByKey.set(key, resolvedProgress);
  return resolvedProgress;
}

function isGpuRetainedContentSwitchAnimationKeyActive({
  checkedByKey,
  key,
  nowMs,
  progressByKey,
  transitions,
}: {
  readonly checkedByKey: ReadonlyMap<string, boolean>;
  readonly key: string;
  readonly nowMs: number;
  readonly progressByKey: ReadonlyMap<string, number>;
  readonly transitions: ReadonlyMap<string, GpuRetainedContentSwitchTransition>;
}): boolean {
  void nowMs;
  if (transitions.has(key)) {
    return true;
  }
  const checked = checkedByKey.get(key);
  const progress = progressByKey.get(key);
  return (
    checked !== undefined &&
    progress !== undefined &&
    Math.abs(progress - (checked ? 1 : 0)) > 0.001
  );
}

function isGpuRetainedContentSwitchTransitionComplete(
  transition: GpuRetainedContentSwitchTransition,
  nowMs: number,
): boolean {
  if ((nowMs - transition.startedAtMs) / transition.durationMs < 1) {
    return false;
  }
  if (!transition.protectFromCheckedUntilComplete) {
    return true;
  }
  return (
    transition.targetSceneMatchedAtMs !== undefined &&
    nowMs - transition.targetSceneMatchedAtMs >=
      SWITCH_INTERACTION_TARGET_SCENE_SETTLE_DELAY_MS
  );
}

function isGpuRetainedContentSwitchTransitionSourceFresh({
  command,
  isRowFresh,
  transition,
}: {
  readonly command: GpuRetainedContentSwitchCommand | undefined;
  readonly isRowFresh: (rowId: string) => boolean;
  readonly transition: GpuRetainedContentSwitchTransition;
}): boolean {
  if (!command) {
    return true;
  }
  if (command.control.checked !== transition.toChecked) {
    return false;
  }
  return isRowFresh(transition.rowId);
}

function removeMissingGpuRetainedContentSwitchKeys({
  clearKey,
  nextKeys,
  previousKeys,
  transitions,
}: {
  readonly clearKey: (key: string) => void;
  readonly nextKeys: Set<string>;
  readonly previousKeys: ReadonlySet<string> | undefined;
  readonly transitions: ReadonlyMap<string, GpuRetainedContentSwitchTransition>;
}) {
  if (!previousKeys) {
    return;
  }
  for (const previousKey of previousKeys) {
    if (nextKeys.has(previousKey)) {
      continue;
    }
    if (transitions.has(previousKey)) {
      nextKeys.add(previousKey);
      continue;
    }
    clearKey(previousKey);
  }
}

function addSurfaceKey(
  surfaceKeys: Map<string, Set<string>>,
  surfaceId: string,
  key: string,
) {
  const keys = surfaceKeys.get(surfaceId);
  if (keys) {
    keys.add(key);
    return;
  }
  surfaceKeys.set(surfaceId, new Set([key]));
}

function getGpuRetainedContentSwitchCommands(
  scene: GpuRetainedContentScene,
): readonly GpuRetainedContentSwitchCommand[] {
  return scene.drawCommands.filter(
    (command): command is GpuRetainedContentSwitchCommand =>
      command.kind === "row-control" && command.control.kind === "switch",
  );
}

function getGpuRetainedContentSwitchTransitionSourceRect({
  isIncluded,
  surface,
  transitions,
}: {
  readonly isIncluded: (input: {
    readonly command: GpuRetainedContentSwitchCommand;
    readonly transition: GpuRetainedContentSwitchTransition | undefined;
  }) => boolean;
  readonly surface: GpuRetainedContentSwitchAnimationSurface;
  readonly transitions: ReadonlyMap<string, GpuRetainedContentSwitchTransition>;
}): GpuRect | undefined {
  let sourceRect: GpuRect | undefined;
  for (const command of getGpuRetainedContentSwitchCommands(
    surface.retainedScene,
  )) {
    const transition = transitions.get(
      createSwitchAnimationKey(surface.id, command.rowId),
    );
    if (!isIncluded({ command, transition })) {
      continue;
    }
    const commandSourceRect = toSwitchAnimationSourceRect(
      command.rect,
      surface,
    );
    if (!commandSourceRect) {
      continue;
    }
    sourceRect = sourceRect
      ? unionGpuRects(sourceRect, commandSourceRect)
      : commandSourceRect;
  }
  return sourceRect;
}

function getGpuRetainedContentSwitchTransitionRowIds({
  isIncluded,
  surface,
  transitions,
}: {
  readonly isIncluded: (input: {
    readonly command: GpuRetainedContentSwitchCommand;
    readonly transition: GpuRetainedContentSwitchTransition | undefined;
  }) => boolean;
  readonly surface: GpuRetainedContentSwitchAnimationSurface;
  readonly transitions: ReadonlyMap<string, GpuRetainedContentSwitchTransition>;
}): readonly string[] {
  const rowIds: string[] = [];
  for (const command of getGpuRetainedContentSwitchCommands(
    surface.retainedScene,
  )) {
    const transition = transitions.get(
      createSwitchAnimationKey(surface.id, command.rowId),
    );
    if (isIncluded({ command, transition })) {
      rowIds.push(command.rowId);
    }
  }
  return rowIds;
}

function createSwitchAnimationKey(surfaceId: string, rowId: string): string {
  return `${surfaceId}${SWITCH_ANIMATION_KEY_SEPARATOR}${rowId}`;
}

function toSwitchAnimationSourceRect(
  rect: GpuRect,
  surface: GpuRetainedContentSwitchAnimationSurface,
): GpuRect | undefined {
  const offset = surface.sourceClipOffset ?? { x: 0, y: 0 };
  const left = clamp(rect.x - offset.x, 0, surface.rect.width);
  const top = clamp(rect.y - offset.y, 0, surface.rect.height);
  const right = clamp(rect.x + rect.width - offset.x, 0, surface.rect.width);
  const bottom = clamp(rect.y + rect.height - offset.y, 0, surface.rect.height);
  if (right <= left || bottom <= top) {
    return undefined;
  }
  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

function unionGpuRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return {
    height: maxY - y,
    width: maxX - x,
    x,
    y,
  };
}

function prefersGpuRetainedContentReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getGpuRetainedContentSwitchNowMs(): number {
  if (
    typeof globalThis.performance !== "undefined" &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
