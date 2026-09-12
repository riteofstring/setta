import { useCallback, useLayoutEffect, useState } from "react";
import { createStore } from "zustand/vanilla";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

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

export function useCodeMirrorTooltipParent(): HTMLElement | null {
  return useWorkspaceStore(
    getCodeMirrorTooltipParentStore(useWorkspaceHost()),
    (state) => state.element,
  );
}

export function useCodeMirrorTooltipParentRef() {
  const host = useWorkspaceHost();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((nextElement: HTMLDivElement | null) => {
    setElement(nextElement);
  }, []);
  useLayoutEffect(() => {
    const store = getCodeMirrorTooltipParentStore(host);
    store.setState({ element });
    return () => {
      if (store.getState().element === element) {
        store.setState({ element: null });
      }
    };
  }, [element, host]);
  return ref;
}
