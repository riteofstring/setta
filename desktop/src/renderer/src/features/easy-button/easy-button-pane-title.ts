import { type RefObject, useEffect } from "react";

import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";
import { applyConversationPaletteStyle } from "./conversation-palette-style";
import type { EasyButtonProjectionView } from "./easy-button-surface";

export function useEasyButtonPaneTitle(
  rootRef: RefObject<HTMLElement | null>,
  view: EasyButtonProjectionView,
) {
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
    if (!host) {
      return;
    }
    const suffix = paneTitleSuffix(view);
    const title = suffix ? `${view.title} · ${suffix}` : view.title;
    setHostPaneChromeTitle(host, {
      fullTitle: title,
      title,
      truncation: "end",
    });
    if (!view.conversationId || !view.paletteId) {
      return;
    }
    host.dataset.conversationId = view.conversationId;
    host.dataset.conversationPalette = view.paletteId;
    host.classList.add("conversation-presentation-identity");
    const removePaletteStyle = applyConversationPaletteStyle(host, view.paletteId);
    return () => {
      removePaletteStyle();
      if (host.dataset.conversationId === view.conversationId) {
        delete host.dataset.conversationId;
        delete host.dataset.conversationPalette;
        host.classList.remove("conversation-presentation-identity");
      }
    };
  }, [
    rootRef,
    view.conversationId,
    view.paletteId,
    view.projectionStatus,
    view.title,
    view.viewState,
  ]);
}

function paneTitleSuffix(view: EasyButtonProjectionView): string {
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
