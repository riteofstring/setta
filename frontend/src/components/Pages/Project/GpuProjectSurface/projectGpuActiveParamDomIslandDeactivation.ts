const PROJECT_GPU_ACTIVE_PARAM_DOM_ISLAND_PRESERVE_TARGET_SELECTOR = [
  '[data-gpu-flow-dom-island="true"]',
  '[data-gpu-flow-retained-content-native="true"]',
].join(", ");

export function shouldClearProjectGpuActiveParamDomIslandOnPointerDown(
  target: EventTarget | null,
): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return true;
  }
  return (
    target.closest(
      PROJECT_GPU_ACTIVE_PARAM_DOM_ISLAND_PRESERVE_TARGET_SELECTOR,
    ) === null
  );
}
