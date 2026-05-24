type AttachParamFixedHeightObserversInput = {
  outerElement: HTMLElement;
  onMeasure: () => void;
};

export type ParamFixedHeightObservation = {
  collectFixedElements(): HTMLElement[];
  disconnect(): void;
};

export function getParamFixedHeightElements(
  outerElement: HTMLElement,
): HTMLElement[] {
  return Array.from(outerElement.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.dataset.paramsFixed === "true",
  );
}

export function attachParamFixedHeightObservers({
  outerElement,
  onMeasure,
}: AttachParamFixedHeightObserversInput): ParamFixedHeightObservation {
  const resizeObserver = new ResizeObserver(onMeasure);
  const mutationObserver = new MutationObserver(onMeasure);
  const observedElements = new Set<HTMLElement>();

  const collectFixedElements = () => {
    const fixedElements = getParamFixedHeightElements(outerElement);
    const nextObservedElements = new Set(fixedElements);

    for (const element of observedElements) {
      if (!nextObservedElements.has(element)) {
        resizeObserver.unobserve(element);
        observedElements.delete(element);
      }
    }

    for (const element of nextObservedElements) {
      if (!observedElements.has(element)) {
        resizeObserver.observe(element);
        observedElements.add(element);
      }
    }

    return fixedElements;
  };

  mutationObserver.observe(outerElement, { childList: true });

  return {
    collectFixedElements,
    disconnect() {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      observedElements.clear();
    },
  };
}
