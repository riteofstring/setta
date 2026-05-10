import type { GpuFrameReason } from "../gpuRenderer";
import {
  resolveGpuRetainedContentKeyboardNavigation,
  type GpuRetainedContentKeyboardCommand,
  type GpuRetainedContentKeyboardNavigationResult,
  type GpuRetainedContentNavigationTarget,
} from "../retainedContentKeyboard";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuFlowScene } from "../scene";
import { shouldPreserveGpuRetainedContentNativeTarget } from "./retainedContentInteraction";

export type GpuRetainedContentKeyboardNavigationEvent =
  GpuRetainedContentKeyboardNavigationResult & {
    readonly nativeEvent: KeyboardEvent;
    readonly target: NonNullable<
      GpuRetainedContentKeyboardNavigationResult["target"]
    >;
  };

export type GpuRetainedContentKeyboardControllerOptions = {
  readonly disabled?: ((event: KeyboardEvent) => boolean) | undefined;
  readonly element: HTMLElement;
  readonly getCurrentTarget: (
    scene: GpuFlowScene,
    event: KeyboardEvent,
  ) => GpuRetainedContentNavigationTarget | null;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly getScrollOffsets: () => GpuRetainedContentScrollOffsetMap;
  readonly onNavigation: (
    event: GpuRetainedContentKeyboardNavigationEvent,
  ) => void;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
};

export function attachGpuRetainedContentKeyboardController(
  options: GpuRetainedContentKeyboardControllerOptions,
): () => void {
  const controller = new GpuRetainedContentKeyboardController(options);
  controller.attach();
  return () => controller.destroy();
}

class GpuRetainedContentKeyboardController {
  private readonly element: HTMLElement;
  private readonly options: GpuRetainedContentKeyboardControllerOptions;

  constructor(options: GpuRetainedContentKeyboardControllerOptions) {
    this.element = options.element;
    this.options = options;
  }

  attach() {
    this.element.addEventListener("keydown", this.onKeyDown, {
      capture: true,
    });
  }

  destroy() {
    this.element.removeEventListener("keydown", this.onKeyDown, {
      capture: true,
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (shouldSkipRetainedContentKeyboardEvent(event, this.options.disabled)) {
      return;
    }
    const command = getRetainedContentKeyboardCommand(event);
    if (!command) {
      return;
    }
    const scene = this.options.getScene();
    if (!scene) {
      return;
    }
    const currentTarget = this.options.getCurrentTarget(scene, event);
    const result = resolveGpuRetainedContentKeyboardNavigation({
      command,
      currentTarget,
      scene,
      scrollOffsets: this.options.getScrollOffsets(),
    });
    if (!result.changed || !result.target) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.options.onNavigation({
      ...result,
      nativeEvent: event,
      target: result.target,
    });
    this.options.requestFrame?.("viewport");
  };
}

function shouldSkipRetainedContentKeyboardEvent(
  event: KeyboardEvent,
  disabled: ((event: KeyboardEvent) => boolean) | undefined,
): boolean {
  return (
    event.defaultPrevented ||
    hasRetainedContentKeyboardModifier(event) ||
    Boolean(disabled?.(event)) ||
    shouldPreserveGpuRetainedContentNativeTarget(event)
  );
}

function hasRetainedContentKeyboardModifier(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function getRetainedContentKeyboardCommand(
  event: Pick<KeyboardEvent, "key">,
): GpuRetainedContentKeyboardCommand | null {
  if (event.key === "ArrowDown") {
    return "row-forward";
  }
  if (event.key === "ArrowUp") {
    return "row-backward";
  }
  if (event.key === "PageDown") {
    return "page-forward";
  }
  if (event.key === "PageUp") {
    return "page-backward";
  }
  if (event.key === "Home") {
    return "start";
  }
  if (event.key === "End") {
    return "end";
  }
  return null;
}
