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

  const mutationObserver = new MutationObserver(onMeasure);
  mutationObserver.observe(rowsElement, {
    childList: true,
    subtree: true,
  });

  return () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}
