import { useEffect, useRef } from "react";
import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

type SectionRefsState = {
  withNested: Record<string, HTMLElement | null>;
  selfOnly: Record<string, HTMLElement | null>;
};

function createSectionRefsStore() {
  return createStore(
    withResetFn<SectionRefsState>(() => ({
      withNested: {},
      selfOnly: {},
    })),
  );
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createSectionRefsStore>
>();

export function getSectionRefsStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createSectionRefsStore();
  storesByHost.set(host, store);
  return store;
}

export function useSectionRefs<T>(
  selector: (state: SectionRefsState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getSectionRefsStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

function setSectionRef({
  host,
  sectionId,
  withNested,
  selfOnly,
}: {
  host: WorkspaceHost;
  sectionId: string;
  withNested?: HTMLElement | null;
  selfOnly?: HTMLElement | null;
}) {
  getSectionRefsStore(host).setState((state) => {
    if (withNested) {
      return { withNested: { ...state.withNested, [sectionId]: withNested } };
    }
    return { selfOnly: { ...state.selfOnly, [sectionId]: selfOnly ?? null } };
  });
}

function deleteSectionRef({
  host,
  sectionId,
}: {
  host: WorkspaceHost;
  sectionId: string;
}) {
  getSectionRefsStore(host).setState((state) => {
    const withNested = { ...state.withNested };
    const selfOnly = { ...state.selfOnly };
    delete withNested[sectionId];
    delete selfOnly[sectionId];
    return { withNested, selfOnly };
  });
}

export function useSectionRefAndInit(
  sectionId: string,
  type: "withNested" | "selfOnly",
) {
  const host = useWorkspaceHost();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSectionRef({ host, sectionId, [type]: ref.current });
    return () => deleteSectionRef({ host, sectionId });
  }, [host, sectionId, type]);

  return ref;
}
