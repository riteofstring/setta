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
const PROJECT_GPU_DOM_ISLAND_EXPLICIT_ACTIVATION_TARGET_SELECTOR =
  '[data-gpu-flow-activation-target="true"]';
const PROJECT_GPU_DOM_ISLAND_CANVAS_OWNED_ROLES = new Set([
  "combobox",
  "listbox",
  "option",
  "slider",
  "switch",
]);

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
  return getProjectGpuDomIslandFallbackActivationTarget(root);
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
    shouldMouseActivateProjectGpuDomIslandTarget(target) ||
    shouldClickProjectGpuDomIslandActivationTarget(target) ||
    shouldFocusProjectGpuDomIslandActivationTarget(target)
  );
}

function getProjectGpuDomIslandFallbackActivationTarget(
  root: HTMLElement,
): HTMLElement | null {
  for (const candidate of root.querySelectorAll<HTMLElement>(
    PROJECT_GPU_DOM_ISLAND_INTERACTIVE_SELECTOR,
  )) {
    if (isProjectGpuDomIslandActivationTarget(candidate)) {
      return candidate;
    }
  }
  return null;
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
  return dispatchProjectGpuDomIslandMouseActivationTarget(target, activation);
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
  if (target instanceof HTMLInputElement) {
    return isNativePickerProjectGpuDomIslandInputType(target.type);
  }
  return false;
}

function shouldFocusProjectGpuDomIslandActivationTarget(
  target: HTMLElement,
): boolean {
  if (hasProjectGpuDomIslandCanvasOwnedRole(target)) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    return isNativeEditorProjectGpuDomIslandInputType(target.type);
  }
  return target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function hasProjectGpuDomIslandCanvasOwnedRole(target: HTMLElement): boolean {
  const role = target.getAttribute("role");
  return (
    role !== null &&
    PROJECT_GPU_DOM_ISLAND_CANVAS_OWNED_ROLES.has(role.toLowerCase())
  );
}

function isNativePickerProjectGpuDomIslandInputType(type: string): boolean {
  return [
    "color",
    "date",
    "datetime-local",
    "file",
    "month",
    "time",
    "week",
  ].includes(type);
}

function isNativeEditorProjectGpuDomIslandInputType(type: string): boolean {
  return [
    "",
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "url",
  ].includes(type);
}
