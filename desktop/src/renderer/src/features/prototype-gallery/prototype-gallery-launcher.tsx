import { ArrowRight, Atom, Gauge, Sparkles } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import {
  completeSettingsNavigationRequest,
  type SettingsFocusRequest,
  useSettingsNavigationStore,
} from "../../stores/settings-navigation-store";

export function PrototypeGalleryLauncher({
  focusRequest = null,
}: {
  focusRequest?: SettingsFocusRequest | null;
}) {
  const headingId = useId();
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const openPrototypeGallery = useSettingsNavigationStore((state) => state.openPrototypeGallery);

  useEffect(() => {
    if (focusRequest?.target === "prototype_gallery_launcher") {
      launcherRef.current?.focus();
      completeSettingsNavigationRequest(focusRequest.requestId);
    }
  }, [focusRequest?.requestId, focusRequest?.target]);

  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-3 rounded-sm border border-border bg-card/30 px-3 py-3"
    >
      <header className="flex min-w-0 items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <h2 className="text-xs font-semibold text-foreground" id={headingId}>
            Visual prototype gallery
          </h2>
          <span className="max-w-2xl text-xs leading-5 text-muted-foreground">
            Compare atmospheric workspace backgrounds, procedural agent forms, and obscured
            thinking backdrops without changing the current product visuals.
          </span>
        </span>
      </header>
      <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-3">
        <li className="flex items-center gap-1.5">
          <Gauge aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
          Bounded rendering cost
        </li>
        <li className="flex items-center gap-1.5">
          <Atom aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
          14 interactive concepts
        </li>
        <li className="flex items-center gap-1.5">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
          Current theme colors
        </li>
      </ul>
      <button
        className="flex min-h-11 w-fit items-center gap-2 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground outline-none transition-[scale,opacity] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
        onClick={openPrototypeGallery}
        ref={launcherRef}
        type="button"
      >
        Open prototype gallery
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </section>
  );
}
