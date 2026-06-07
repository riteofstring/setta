import type { NiriLayoutStore } from "./layout-store";

interface PaneTitleEditorRuntime {
  store: Pick<NiriLayoutStore, "renamePane" | "toScene">;
}

interface PaneTitleEditorContext {
  runLayoutAction: (action: () => void) => void;
  runtime: PaneTitleEditorRuntime;
}

export function handlePaneTitleEditorFocusOut({
  event,
  runLayoutAction,
  runtime,
}: PaneTitleEditorContext & {
  event: FocusEvent;
}): void {
  const editor = paneTitleEditorFromEvent(event);
  if (!editor) {
    return;
  }
  commitPaneTitleEditor({ editor, runLayoutAction, runtime });
}

export function handlePaneTitleEditorKeyDown({
  event,
  runLayoutAction,
  runtime,
}: PaneTitleEditorContext & {
  event: KeyboardEvent;
}): boolean {
  const editor = paneTitleEditorFromEvent(event);
  if (!editor) {
    return false;
  }
  event.stopPropagation();
  if (event.key === "Enter") {
    event.preventDefault();
    commitPaneTitleEditor({ editor, runLayoutAction, runtime });
    editor.blur();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    resetPaneTitleEditor({ editor, runtime });
    editor.blur();
  }
  return true;
}

function commitPaneTitleEditor({
  editor,
  runLayoutAction,
  runtime,
}: PaneTitleEditorContext & {
  editor: HTMLElement;
}): boolean {
  const paneId = editor.dataset.paneId;
  const currentTitle = paneId ? runtime.store.toScene().paneById.get(paneId)?.title : undefined;
  if (!paneId || currentTitle === undefined) {
    return false;
  }
  const nextTitle = normalizedPaneTitle(editor.textContent ?? "");
  if (nextTitle.length === 0 || nextTitle === currentTitle) {
    syncPaneTitleEditor(editor, currentTitle);
    return false;
  }
  runLayoutAction(() => runtime.store.renamePane(paneId, nextTitle));
  syncPaneTitleEditor(editor, nextTitle);
  return true;
}

function resetPaneTitleEditor({
  editor,
  runtime,
}: {
  editor: HTMLElement;
  runtime: PaneTitleEditorRuntime;
}): void {
  const paneId = editor.dataset.paneId;
  const currentTitle = paneId ? runtime.store.toScene().paneById.get(paneId)?.title : undefined;
  if (currentTitle !== undefined) {
    syncPaneTitleEditor(editor, currentTitle);
  }
}

function syncPaneTitleEditor(editor: HTMLElement, title: string): void {
  editor.textContent = title;
  editor.title = title;
}

function normalizedPaneTitle(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function paneTitleEditorFromEvent(event: Event): HTMLElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-niri-pane-title-editor="true"]')
    : null;
}
