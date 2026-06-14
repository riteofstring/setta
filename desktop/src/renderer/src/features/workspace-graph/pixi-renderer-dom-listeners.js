/* global window */

export function addWorkflowGraphDomListeners({
  canvas,
  contextMenu,
  keyDown,
  pointerDown,
  pointerLeave,
  pointerMove,
  pointerUp,
  pointerCancel,
  wheel,
}) {
  canvas.addEventListener("pointerdown", pointerDown, true);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerleave", pointerLeave);
  canvas.addEventListener("contextmenu", contextMenu);
  canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerCancel);
  window.addEventListener("keydown", keyDown);
  return () => {
    canvas.removeEventListener("pointerdown", pointerDown, true);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerleave", pointerLeave);
    canvas.removeEventListener("contextmenu", contextMenu);
    canvas.removeEventListener("wheel", wheel, true);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", pointerCancel);
    window.removeEventListener("keydown", keyDown);
  };
}
