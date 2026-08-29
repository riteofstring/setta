import { useLayoutEffect, useRef } from "react";
import { createStore } from "zustand/vanilla";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

// The reference's canvas tooltip parent: its `Viewport` renders one element beside the scene and
// `getExtensions` turns it into `tooltips({ parent })`. CodeMirror otherwise renders a completion
// popup inside the editor that opened it, and a section shell clips its own content, so the popup
// under a compact field is cropped down to the sliver the field's box does not clip.
//
// The element belongs to the transformed viewport, so a tooltip scales and pans with the scene it
// annotates, and it is a sibling of the scene content rather than a descendant of a section, so
// nothing crops it. It is bound to the host instead of a document id: two canvases on one page own
// two parents and neither can resolve, share, or steal the other's.
export const CODEMIRROR_TOOLTIP_PARENT_CLASS_NAME =
  "setta-workspace-codemirror-tooltips";

type CodeMirrorTooltipParentState = { element: HTMLElement | null };

function createCodeMirrorTooltipParentStore() {
  return createStore<CodeMirrorTooltipParentState>(() => ({ element: null }));
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createCodeMirrorTooltipParentStore>
>();

function getCodeMirrorTooltipParentStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createCodeMirrorTooltipParentStore();
  storesByHost.set(host, store);
  return store;
}

// Read by the package's editor assembly. A live editor re-renders when the canvas publishes or
// withdraws its parent, so the editor never holds an element the canvas has taken down.
export function useCodeMirrorTooltipParent(): HTMLElement | null {
  return useWorkspaceStore(
    getCodeMirrorTooltipParentStore(useWorkspaceHost()),
    (state) => state.element,
  );
}

// The viewport's own ref. Publishing happens in layout, before any editor of this host can paint.
export function useCodeMirrorTooltipParentRef() {
  const host = useWorkspaceHost();
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const store = getCodeMirrorTooltipParentStore(host);
    store.setState({ element: ref.current });
    return () => {
      store.setState({ element: null });
    };
  }, [host]);
  return ref;
}
