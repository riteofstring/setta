// One answer for "is this keypress happening inside something the user is typing in", shared by
// the key bindings and the canvas activation keys. The reference asks the same question of the
// event target (`getIsInput`).
export function getIsEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
