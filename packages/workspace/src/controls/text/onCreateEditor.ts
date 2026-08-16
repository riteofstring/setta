import type { EditorView } from "@codemirror/view";
import { getReactFlowStore } from "../../canvas/store";
import type { WorkspaceHost } from "../../workspaceHost";

// The reference's `getOnCreateEditor` minus its completion wrapper: focus the fresh editor,
// carry the activating pointer position into the initial selection, and reveal the layer.

export type TextValueActivationEvent =
  "tab" | { clientX: number; clientY: number };

function fixPlaceholderCursor(
  host: WorkspaceHost,
  editorId: string,
  value: string,
  placeholder: string | undefined,
) {
  // The cursor appears the wrong size when there's a placeholder text and when you're zoomed in.
  // This is a hacky solution to that problem.
  if (!value && placeholder) {
    const cursors = document.querySelectorAll(`#${editorId} .cm-cursor`);
    cursors.forEach((cursor) => {
      if (cursor instanceof HTMLElement) {
        cursor.style.height = `${14 * getReactFlowStore(host).getState().transform[2]}px`;
      }
    });
  }
}

export function getOnCreateEditor({
  host,
  initialEvent,
  setRealIsInitialized,
  editorId,
  value,
  placeholder,
}: {
  host: WorkspaceHost;
  initialEvent: TextValueActivationEvent;
  setRealIsInitialized: (initialized: boolean) => void;
  editorId: string;
  value: string;
  placeholder: string | undefined;
}) {
  return (view: EditorView) => {
    view.contentDOM.focus({ preventScroll: true });
    if (initialEvent !== "tab") {
      const pos = view.posAtCoords({
        x: initialEvent.clientX,
        y: initialEvent.clientY,
      });
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos, head: pos } });
      }
    }
    fixPlaceholderCursor(host, editorId, value, placeholder);
    setRealIsInitialized(true);
  };
}
