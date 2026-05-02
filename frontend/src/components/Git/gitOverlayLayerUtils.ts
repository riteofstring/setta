export function isEditableEscapeTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") {
    return false;
  }
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return (
    target.closest(
      "input, textarea, [contenteditable=''], [contenteditable='true']",
    ) !== null
  );
}
