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
  readonly rowId: string;
  readonly startedAtMs: number;
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
  hasActiveSurface(surfaceId: string, nowMs?: number | undefined): boolean;
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
  syncSurface(
    surface: GpuRetainedContentSwitchAnimationSurface,
    nowMs?: number | undefined,
  ): void;
};

export const DEFAULT_SWITCH_TRANSITION_DURATION_MS = 140;
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
      const keys = surfaceKeys.get(surface.id);
      if (!keys) {
        return undefined;
      }
      let sourceRect: GpuRect | undefined;
      for (const command of getGpuRetainedContentSwitchCommands(
        surface.retainedScene,
      )) {
        if (
          !transitions.has(createSwitchAnimationKey(surface.id, command.rowId))
        ) {
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
    },
    hasActiveSurface(surfaceId, nowMs = getGpuRetainedContentSwitchNowMs()) {
      void nowMs;
      const keys = surfaceKeys.get(surfaceId);
      if (!keys) {
        return false;
      }
      for (const key of keys) {
        if (transitions.has(key)) {
          return true;
        }
        const checked = checkedByKey.get(key);
        const progress = progressByKey.get(key);
        if (
          checked !== undefined &&
          progress !== undefined &&
          Math.abs(progress - (checked ? 1 : 0)) > 0.001
        ) {
          return true;
        }
      }
      return false;
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
        transitions.delete(key);
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
    key,
    transition,
    transitions,
  });
  if (reusableTransition) {
    return reusableTransition;
  }
  const previousChecked = checkedByKey.get(key);
  if (shouldKeepSwitchWithoutTransition({ checked, previousChecked, transition })) {
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
  key,
  transition,
  transitions,
}: {
  readonly checked: boolean;
  readonly key: string;
  readonly transition: GpuRetainedContentSwitchTransition | undefined;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}): GpuRetainedContentSwitchTransition | undefined {
  if (!transition) {
    return undefined;
  }
  if (transition.toChecked === checked) {
    return resolveSceneMatchedSwitchTransition({
      key,
      transition,
      transitions,
    });
  }
  if (transition.pendingSceneMatch && transition.fromChecked === checked) {
    return transition;
  }
  return undefined;
}

function resolveSceneMatchedSwitchTransition({
  key,
  transition,
  transitions,
}: {
  readonly key: string;
  readonly transition: GpuRetainedContentSwitchTransition;
  readonly transitions: Map<string, GpuRetainedContentSwitchTransition>;
}): GpuRetainedContentSwitchTransition {
  if (!transition.pendingSceneMatch) {
    return transition;
  }
  const matchedTransition = {
    ...transition,
    pendingSceneMatch: false,
  };
  transitions.set(key, matchedTransition);
  return matchedTransition;
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
  nextKeys.add(key);
  const previousChecked = checkedByKey.get(key);
  if (previousChecked === undefined && !progressByKey.has(key)) {
    progressByKey.set(key, command.control.checked ? 1 : 0);
  }
  if (
    previousChecked !== undefined &&
    previousChecked !== command.control.checked
  ) {
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
      reduceMotion,
      rowId: command.rowId,
      surfaceId,
      toChecked: command.control.checked,
      transitions,
    });
  }
  checkedByKey.set(key, command.control.checked);
}

function setGpuRetainedContentSwitchTransition({
  durationMs,
  fromChecked,
  fromProgress,
  key,
  nowMs,
  pendingSceneMatch,
  progressByKey,
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

function removeMissingGpuRetainedContentSwitchKeys({
  clearKey,
  nextKeys,
  previousKeys,
}: {
  readonly clearKey: (key: string) => void;
  readonly nextKeys: ReadonlySet<string>;
  readonly previousKeys: ReadonlySet<string> | undefined;
}) {
  if (!previousKeys) {
    return;
  }
  for (const previousKey of previousKeys) {
    if (!nextKeys.has(previousKey)) {
      clearKey(previousKey);
    }
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
