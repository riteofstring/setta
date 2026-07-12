import { type RefObject, useEffect } from "react";

import { setHostPaneChromeTitle } from "../../workspace-layout/pane-title-metadata";
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
  }, [rootRef, view]);
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
