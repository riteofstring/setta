import { NO_DRAG_CLASS_NAME } from "../interaction";
import { getElementTextDirection } from "../styles/textDirection";
import { getKeyboardWorkspaceMenuPoint } from "./workspaceMenuGeometry";

const NATIVE_CONTEXT_MENU_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "option",
  "[contenteditable]",
  "[role='textbox']",
  "[role='combobox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  `.${NO_DRAG_CLASS_NAME}`,
].join(",");

export function isWorkspaceMenuKeyboardEvent(event: Pick<KeyboardEvent, "key" | "shiftKey">) {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

export function shouldRetainNativeContextMenu(
  target: EventTarget | null,
  boundary: HTMLElement,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const nativeOwner = target.closest(NATIVE_CONTEXT_MENU_SELECTOR);
  return nativeOwner !== null && boundary.contains(nativeOwner);
}

export function getOwnerKeyboardMenuPoint(owner: HTMLElement) {
  return getKeyboardWorkspaceMenuPoint(
    owner.getBoundingClientRect(),
    getElementTextDirection(owner),
  );
}
