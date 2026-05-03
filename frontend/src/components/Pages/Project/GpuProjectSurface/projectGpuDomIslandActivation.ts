import type { GpuDomIsland } from "gpuFlow/scene";
import { useLayoutEffect, useRef, type MutableRefObject } from "react";

const PROJECT_GPU_DOM_ISLAND_INTERACTIVE_SELECTOR = [
  "[data-gpu-flow-interactive='true']",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const PROJECT_GPU_DOM_ISLAND_MOUSE_ACTIVATION_SELECTOR =
  '[data-gpu-flow-activation="mousedown"]';
const PROJECT_GPU_DOM_ISLAND_POINTER_ACTIVATION_SELECTOR =
  '[data-gpu-flow-activation="pointer"]';
const PROJECT_GPU_DOM_ISLAND_EXPLICIT_ACTIVATION_TARGET_SELECTOR =
  '[data-gpu-flow-activation-target="true"]';

export function useProjectGpuDomIslandActivation<
  RootElement extends HTMLElement,
>({
  activation,
  clickActivationTarget,
  paramInfoId,
  rootRef,
  sectionId,
}: {
  readonly activation?: GpuDomIsland["activation"] | undefined;
  readonly clickActivationTarget: boolean;
  readonly paramInfoId: string;
  readonly rootRef: MutableRefObject<RootElement | null>;
  readonly sectionId: string;
}) {
  const consumedActivationKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    activateProjectGpuDomIsland({
      activation,
      clickActivationTarget,
      consumedActivationKeyRef,
      root: rootRef.current,
    });
  }, [
    activation?.kind,
    activation?.clientPoint.x,
    activation?.clientPoint.y,
    clickActivationTarget,
    paramInfoId,
    rootRef,
    sectionId,
  ]);
}

function activateProjectGpuDomIsland({
  activation,
  clickActivationTarget,
  consumedActivationKeyRef,
  root,
}: {
  readonly activation?: GpuDomIsland["activation"] | undefined;
  readonly clickActivationTarget: boolean;
  readonly consumedActivationKeyRef: MutableRefObject<string | null>;
  readonly root: HTMLElement | null;
}) {
  if (!root) {
    return;
  }
  const target = getProjectGpuDomIslandActivationTarget(root, activation);
  if (!activation) {
    target?.focus({ preventScroll: true });
    return;
  }
  const activationKey = getProjectGpuDomIslandActivationKey(activation);
  if (consumedActivationKeyRef.current === activationKey) {
    return;
  }
  consumedActivationKeyRef.current = activationKey;
  replayProjectGpuDomIslandActivation({
    activation,
    clickActivationTarget,
    target,
  });
}

function replayProjectGpuDomIslandActivation({
  activation,
  clickActivationTarget,
  target,
}: {
  readonly activation: NonNullable<GpuDomIsland["activation"]>;
  readonly clickActivationTarget: boolean;
  readonly target: HTMLElement | null;
}) {
  if (!target) {
    return;
  }
  if (dispatchProjectGpuDomIslandActivationTarget(target, activation)) {
    return;
  }
  target.focus({ preventScroll: true });
  if (
    clickActivationTarget &&
    shouldClickProjectGpuDomIslandActivationTarget(target)
  ) {
    target.click();
  }
}

function getProjectGpuDomIslandActivationTarget(
  root: HTMLElement,
  activation: GpuDomIsland["activation"] | undefined,
): HTMLElement | null {
  const pointedElement = getProjectGpuDomIslandPointedElement(root, activation);
  const pointedExplicitTarget = getProjectGpuDomIslandClosestTarget(
    root,
    pointedElement,
    PROJECT_GPU_DOM_ISLAND_EXPLICIT_ACTIVATION_TARGET_SELECTOR,
  );
  if (pointedExplicitTarget) {
    return pointedExplicitTarget;
  }
  const pointedTarget = getProjectGpuDomIslandClosestInteractiveTarget(
    root,
    pointedElement,
  );
  if (pointedTarget && isProjectGpuDomIslandActivationTarget(pointedTarget)) {
    return pointedTarget;
  }
  const descendantExplicitTarget =
    pointedTarget?.querySelector<HTMLElement>(
      PROJECT_GPU_DOM_ISLAND_EXPLICIT_ACTIVATION_TARGET_SELECTOR,
    ) ?? null;
  if (descendantExplicitTarget) {
    return descendantExplicitTarget;
  }
  const fallbackExplicitTarget = root.querySelector<HTMLElement>(
    PROJECT_GPU_DOM_ISLAND_EXPLICIT_ACTIVATION_TARGET_SELECTOR,
  );
  if (fallbackExplicitTarget) {
    return fallbackExplicitTarget;
  }
  if (pointedTarget) {
    return pointedTarget;
  }
  return root.querySelector<HTMLElement>(
    PROJECT_GPU_DOM_ISLAND_INTERACTIVE_SELECTOR,
  );
}

function getProjectGpuDomIslandPointedElement(
  root: HTMLElement,
  activation: GpuDomIsland["activation"] | undefined,
): Element | null {
  if (!activation) {
    return null;
  }
  const elementFromPoint = root.ownerDocument.elementFromPoint;
  if (!elementFromPoint) {
    return null;
  }
  const element = elementFromPoint.call(
    root.ownerDocument,
    activation.clientPoint.x,
    activation.clientPoint.y,
  );
  return element && root.contains(element) ? element : null;
}

function getProjectGpuDomIslandClosestInteractiveTarget(
  root: HTMLElement,
  element: Element | null,
): HTMLElement | null {
  return getProjectGpuDomIslandClosestTarget(
    root,
    element,
    PROJECT_GPU_DOM_ISLAND_INTERACTIVE_SELECTOR,
  );
}

function getProjectGpuDomIslandClosestTarget(
  root: HTMLElement,
  element: Element | null,
  selector: string,
): HTMLElement | null {
  const target = element?.closest(selector);
  if (
    target instanceof HTMLElement &&
    root.contains(target) &&
    target !== root
  ) {
    return target;
  }
  return null;
}

function isProjectGpuDomIslandActivationTarget(target: HTMLElement): boolean {
  return (
    shouldPointerActivateProjectGpuDomIslandTarget(target) ||
    shouldMouseActivateProjectGpuDomIslandTarget(target) ||
    shouldClickProjectGpuDomIslandActivationTarget(target) ||
    target.tabIndex >= 0
  );
}

function getProjectGpuDomIslandActivationKey(
  activation: NonNullable<GpuDomIsland["activation"]>,
): string {
  return `${activation.kind}:${activation.clientPoint.x}:${activation.clientPoint.y}`;
}

function dispatchProjectGpuDomIslandActivationTarget(
  target: HTMLElement,
  activation: NonNullable<GpuDomIsland["activation"]>,
): boolean {
  if (dispatchProjectGpuDomIslandPointerActivationTarget(target, activation)) {
    return true;
  }
  return dispatchProjectGpuDomIslandMouseActivationTarget(target, activation);
}

function dispatchProjectGpuDomIslandPointerActivationTarget(
  target: HTMLElement,
  activation: NonNullable<GpuDomIsland["activation"]>,
): boolean {
  if (!shouldPointerActivateProjectGpuDomIslandTarget(target)) {
    return false;
  }
  const pointerId = 1;
  target.dispatchEvent(
    createProjectGpuDomIslandPointerActivationEvent("pointerdown", {
      activation,
      buttons: 1,
      pointerId,
    }),
  );
  target.dispatchEvent(
    createProjectGpuDomIslandPointerActivationEvent("pointerup", {
      activation,
      buttons: 0,
      pointerId,
    }),
  );
  return true;
}

function dispatchProjectGpuDomIslandMouseActivationTarget(
  target: HTMLElement,
  activation: NonNullable<GpuDomIsland["activation"]>,
): boolean {
  if (!shouldMouseActivateProjectGpuDomIslandTarget(target)) {
    return false;
  }
  target.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: activation.clientPoint.x,
      clientY: activation.clientPoint.y,
      composed: true,
      detail: 1,
      screenX: activation.clientPoint.x,
      screenY: activation.clientPoint.y,
    }),
  );
  return true;
}

function shouldPointerActivateProjectGpuDomIslandTarget(
  target: HTMLElement,
): boolean {
  return (
    target.closest(PROJECT_GPU_DOM_ISLAND_POINTER_ACTIVATION_SELECTOR) !== null
  );
}

function shouldMouseActivateProjectGpuDomIslandTarget(
  target: HTMLElement,
): boolean {
  return (
    target.closest(PROJECT_GPU_DOM_ISLAND_MOUSE_ACTIVATION_SELECTOR) !== null
  );
}

function shouldClickProjectGpuDomIslandActivationTarget(
  target: HTMLElement,
): boolean {
  if (
    target.matches(PROJECT_GPU_DOM_ISLAND_EXPLICIT_ACTIVATION_TARGET_SELECTOR)
  ) {
    return true;
  }
  if (isCanvasOwnedProjectGpuDomIslandRole(target.getAttribute("role"))) {
    return false;
  }
  if (target instanceof HTMLButtonElement) {
    return true;
  }
  if (target instanceof HTMLSelectElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return isClickActivatedProjectGpuDomIslandInputType(target.type);
  }
  return false;
}

function isCanvasOwnedProjectGpuDomIslandRole(role: string | null): boolean {
  return role === "combobox" || role === "switch";
}

function isClickActivatedProjectGpuDomIslandInputType(type: string): boolean {
  return ![
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "time",
    "url",
  ].includes(type);
}

function createProjectGpuDomIslandPointerActivationEvent(
  type: "pointerdown" | "pointerup",
  {
    activation,
    buttons,
    pointerId,
  }: {
    readonly activation: NonNullable<GpuDomIsland["activation"]>;
    readonly buttons: number;
    readonly pointerId: number;
  },
): Event {
  const init = {
    bubbles: true,
    button: 0,
    buttons,
    cancelable: true,
    clientX: activation.clientPoint.x,
    clientY: activation.clientPoint.y,
    composed: true,
    detail: 1,
    screenX: activation.clientPoint.x,
    screenY: activation.clientPoint.y,
  };
  if (typeof PointerEvent === "function") {
    return new PointerEvent(type, {
      ...init,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
    });
  }
  const event = new MouseEvent(type, init);
  Object.defineProperties(event, {
    isPrimary: {
      configurable: true,
      value: true,
    },
    pointerId: {
      configurable: true,
      value: pointerId,
    },
    pointerType: {
      configurable: true,
      value: "mouse",
    },
  });
  return event;
}
