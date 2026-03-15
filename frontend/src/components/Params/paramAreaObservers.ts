type AttachParamAreaObserversInput = {
  rowsElement: HTMLElement;
  headerElement?: HTMLElement | null;
  onMeasure: () => void;
};

export function attachParamAreaObservers({
  rowsElement,
  headerElement,
  onMeasure,
}: AttachParamAreaObserversInput): () => void {
  const resizeObserver = new ResizeObserver(onMeasure);
  resizeObserver.observe(rowsElement);
  if (headerElement) {
    resizeObserver.observe(headerElement);
  }

  const inputEvents = ["input", "change", "compositionend"] as const;
  for (const eventName of inputEvents) {
    rowsElement.addEventListener(eventName, onMeasure);
  }

  return () => {
    for (const eventName of inputEvents) {
      rowsElement.removeEventListener(eventName, onMeasure);
    }
    resizeObserver.disconnect();
  };
}
