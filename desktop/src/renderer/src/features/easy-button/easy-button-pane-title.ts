import { type RefObject, useLayoutEffect } from "react";

import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";
import { reactDomSurfaceHostChangedEvent } from "../../workspace-layout/react-dom-surface-events";
import { claimConversationPaletteIdentity } from "./conversation-palette-identity";
import type { EasyButtonProjectionView } from "./easy-button-surface";

type EasyButtonPanePresentation = Pick<
  EasyButtonProjectionView,
  "conversationId" | "paletteId" | "projectionStatus" | "title" | "viewState"
>;

export function useEasyButtonPaneTitle(
  rootRef: RefObject<HTMLElement | null>,
  view: EasyButtonProjectionView,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    return bindEasyButtonPanePresentation(root, view);
  }, [
    rootRef,
    view.conversationId,
    view.paletteId,
    view.projectionStatus,
    view.title,
    view.viewState,
  ]);
}

export function bindEasyButtonPanePresentation(
  root: HTMLElement,
  view: EasyButtonPanePresentation,
): () => void {
  const surfaceContainer = root.closest<HTMLElement>(".workspace-react-dom-surface");
  let currentHost: HTMLElement | null = null;
  let releaseCurrentHost: (() => void) | null = null;
  const syncHost = () => {
    const nextHost = root.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
    if (nextHost !== currentHost) {
      releaseCurrentHost?.();
      currentHost = nextHost;
      releaseCurrentHost = nextHost ? claimPanePresentationHost(nextHost, view) : null;
    }
    if (nextHost) {
      syncPaneChromeTitle(nextHost, view);
    }
  };
  syncHost();
  surfaceContainer?.addEventListener(reactDomSurfaceHostChangedEvent, syncHost);
  return () => {
    surfaceContainer?.removeEventListener(reactDomSurfaceHostChangedEvent, syncHost);
    releaseCurrentHost?.();
  };
}

function claimPanePresentationHost(
  host: HTMLElement,
  view: EasyButtonPanePresentation,
): () => void {
  return claimConversationPaletteIdentity(
    host,
    view.conversationId && view.paletteId
      ? { conversationId: view.conversationId, paletteId: view.paletteId }
      : null,
  );
}

function syncPaneChromeTitle(host: HTMLElement, view: EasyButtonPanePresentation): void {
  const suffix = paneTitleSuffix(view);
  const title = suffix ? `${view.title} · ${suffix}` : view.title;
  setHostPaneChromeTitle(host, {
    fullTitle: title,
    title,
    truncation: "end",
  });
}

function paneTitleSuffix(view: EasyButtonPanePresentation): string {
  if (view.projectionStatus === "binding_required") {
    return "conversation required";
  }
  if (view.projectionStatus === "loading" || view.projectionStatus === "resyncing") {
    return "loading";
  }
  switch (view.viewState) {
    case "working":
      return "working";
    case "complete":
      return "complete";
    case "idle":
      return "";
  }
}
