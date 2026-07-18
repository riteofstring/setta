import type { ConversationPresentationProfile } from "@generated/backend";
import { type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ConversationPresentationConfiguration } from "../../components/presentation-configuration-settings";
import { reactDomSurfaceHostChangedEvent } from "../../workspace-layout/react-dom-surface-events";

/* The "Voice and color" settings live in the pane's title bar, which the layout
   engine builds imperatively (see presentation-engine.ts) — so the React surface
   can't render there directly. Instead it owns a private slot appended to the top
   bar and portals the settings into it, re-syncing whenever the pane re-mounts
   (same host-changed signal the pane title binding uses). The engine only manages
   the drag handle, title slot, and action strip, so it leaves this slot alone. */
export function EasyButtonPresentationChrome({
  archived,
  profile,
  rootRef,
  workspaceId,
}: {
  archived: boolean;
  profile: ConversationPresentationProfile | null;
  rootRef: RefObject<HTMLElement | null>;
  workspaceId: string | null;
}) {
  const slot = useEasyButtonTitleBarSlot(rootRef);
  if (!slot || !profile || !workspaceId) {
    return null;
  }
  return createPortal(
    <ConversationPresentationConfiguration
      archived={archived}
      profile={profile}
      workspaceId={workspaceId}
    />,
    slot,
  );
}

function useEasyButtonTitleBarSlot(rootRef: RefObject<HTMLElement | null>): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // useEffect, not useLayoutEffect: this component renders as a child of the
  // surface section, so a layout effect here would run before the section's ref is
  // attached (child effects commit before the parent's ref). A passive effect runs
  // after the whole tree commits, when rootRef.current is guaranteed set.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const surfaceContainer = root.closest<HTMLElement>(".workspace-react-dom-surface");
    let currentSlot: HTMLElement | null = null;
    const sync = () => {
      const host = root.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
      const topBar = host?.querySelector<HTMLElement>(".workspace-pane-top-bar") ?? null;
      if (!topBar) {
        setSlot(null);
        currentSlot = null;
        return;
      }
      const existing =
        topBar.querySelector<HTMLElement>('[data-easy-button-chrome-slot="true"]') ??
        createChromeSlot(topBar);
      if (existing !== currentSlot) {
        currentSlot = existing;
        setSlot(existing);
      }
    };
    sync();
    surfaceContainer?.addEventListener(reactDomSurfaceHostChangedEvent, sync);
    return () => {
      surfaceContainer?.removeEventListener(reactDomSurfaceHostChangedEvent, sync);
      currentSlot?.remove();
      currentSlot = null;
      setSlot(null);
    };
  }, [rootRef]);
  return slot;
}

function createChromeSlot(topBar: HTMLElement): HTMLElement {
  const slot = topBar.ownerDocument.createElement("div");
  slot.className = "easy-button-chrome-slot app-no-drag";
  slot.dataset.easyButtonChromeSlot = "true";
  // Sit just left of the engine's maximize/close action strip.
  const actionStrip = topBar.querySelector(".workspace-pane-action-strip");
  topBar.insertBefore(slot, actionStrip);
  return slot;
}
