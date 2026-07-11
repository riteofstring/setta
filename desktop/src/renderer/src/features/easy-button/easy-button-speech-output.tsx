import { Volume1, Volume2, VolumeX } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { SpeechCapabilities } from "@generated/backend";

import { FloatingMenu } from "../../components/floating-menu";
import { reactDomSurfaceHostChangedEvent } from "../../workspace-layout/react-dom-surface-events";
import type { SpeechPlaybackState } from "./speech-playback-controller";
import { type SpeechOutputMode } from "./speech-output-preference";
import type { SpeechCaptureAvailability } from "./use-speech-capture";
import { useSpeechPlayback } from "./use-speech-playback";

interface EasyButtonSpeechOutputProps {
  availability: SpeechCaptureAvailability;
  rootRef: RefObject<HTMLElement | null>;
  workspaceId: string | null;
}

type SpeechOutputAvailability =
  | { capabilities: SpeechCapabilities; type: "configured" }
  | { message: string; type: "failed" }
  | { type: "loading" }
  | { type: "not_configured" };

const outputModeOptions = [
  { label: "Off", mode: "off" },
  { label: "Speak the summary", mode: "final" },
  { label: "Speak highlights and summary", mode: "highlights_and_final" },
] as const satisfies ReadonlyArray<{ label: string; mode: SpeechOutputMode }>;

const outputModeLabels = {
  final: "Speak the summary",
  highlights_and_final: "Speak highlights and summary",
  off: "Off",
} satisfies Record<SpeechOutputMode, string>;

export function EasyButtonSpeechOutput({
  availability,
  rootRef,
  workspaceId,
}: EasyButtonSpeechOutputProps) {
  const portalTarget = usePaneTopBarPortalTarget(rootRef);
  const playback = useSpeechPlayback(workspaceId);
  const outputAvailability = speechOutputAvailability(availability);

  useHostSpeechOutputState(
    rootRef,
    portalTarget,
    outputAvailability,
    playback.mode,
    playback.state,
  );
  if (!portalTarget || outputAvailability.type === "loading") {
    return null;
  }
  return createPortal(
    outputAvailability.type === "configured" ? (
      <ConfiguredSpeechOutputControl
        capabilities={outputAvailability.capabilities}
        mode={playback.mode}
        playbackState={playback.state}
        setMode={playback.setMode}
        stop={playback.stop}
      />
    ) : (
      <UnavailableSpeechOutputControl availability={outputAvailability} />
    ),
    portalTarget,
  );
}

function ConfiguredSpeechOutputControl({
  capabilities,
  mode,
  playbackState,
  setMode,
  stop,
}: {
  capabilities: SpeechCapabilities;
  mode: SpeechOutputMode;
  playbackState: SpeechPlaybackState;
  setMode: (mode: SpeechOutputMode) => void;
  stop: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useDismissedSpeechPopover(open, setOpen, rootRef, menuRef);
  const canStop = playbackState.type === "speaking" || playbackState.type === "synthesizing";

  return (
    <span className="easy-button-audio-cluster app-no-drag" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={speechOutputControlLabel(mode, playbackState)}
        className="easy-button-audio-toggle"
        data-easy-button-output-mode={mode}
        data-easy-button-playback={playbackState.type}
        data-testid="easy-button-audio-toggle"
        onClick={() => {
          if (canStop) {
            stop();
            setOpen(false);
            return;
          }
          setOpen((current) => !current);
        }}
        ref={buttonRef}
        title={speechOutputControlLabel(mode, playbackState)}
        type="button"
      >
        <SpeechOutputGlyph mode={mode} />
        <SpeechOutputEqualizer />
      </button>
      <FloatingMenu
        align="right"
        anchorRef={buttonRef}
        ariaLabel="Voice output options"
        className="easy-button-audio-menu"
        menuRef={menuRef}
        open={open}
        placement="bottom"
        role="menu"
      >
        {outputModeOptions.map((option) => (
          <button
            aria-checked={mode === option.mode}
            className="easy-button-audio-menu-item"
            data-active={mode === option.mode ? "true" : "false"}
            data-easy-button-output-option={option.mode}
            key={option.mode}
            onClick={() => {
              setMode(option.mode);
              setOpen(false);
            }}
            role="menuitemradio"
            type="button"
          >
            {option.label}
          </button>
        ))}
        <p className="easy-button-audio-disclosure" data-testid="easy-button-audio-disclosure">
          {capabilities.aiVoiceDisclosure}
        </p>
      </FloatingMenu>
    </span>
  );
}

function UnavailableSpeechOutputControl({
  availability,
}: {
  availability: Exclude<SpeechOutputAvailability, { type: "configured" | "loading" }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useDismissedSpeechPopover(open, setOpen, rootRef, menuRef);
  const notConfigured = availability.type === "not_configured";

  return (
    <span className="easy-button-voice-off-cluster app-no-drag" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={notConfigured ? "Explain why voice is off" : "Explain why voice is unavailable"}
        className="easy-button-voice-off-chip"
        data-testid="easy-button-voice-off-chip"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        {notConfigured ? "Voice off" : "Voice unavailable"}
      </button>
      <FloatingMenu
        align="right"
        anchorRef={buttonRef}
        ariaLabel="Voice availability"
        className="easy-button-voice-off-popover"
        menuRef={menuRef}
        open={open}
        placement="bottom"
        role="dialog"
      >
        {notConfigured ? (
          <p>
            Voice needs <code>OPENAI_API_KEY</code> on the runtime. Typed requests work either way.
          </p>
        ) : (
          <p>{availability.message}</p>
        )}
      </FloatingMenu>
    </span>
  );
}

function SpeechOutputGlyph({ mode }: { mode: SpeechOutputMode }) {
  switch (mode) {
    case "off":
      return <VolumeX aria-hidden="true" className="easy-button-audio-glyph" />;
    case "final":
      return <Volume1 aria-hidden="true" className="easy-button-audio-glyph" />;
    case "highlights_and_final":
      return <Volume2 aria-hidden="true" className="easy-button-audio-glyph" />;
  }
}

function SpeechOutputEqualizer() {
  return (
    <span aria-hidden="true" className="easy-button-audio-equalizer">
      <i />
      <i />
      <i />
    </span>
  );
}

function speechOutputAvailability(
  availability: SpeechCaptureAvailability,
): SpeechOutputAvailability {
  switch (availability.type) {
    case "configured":
      return { capabilities: availability.capabilities, type: "configured" };
    case "unsupported":
      return availability.capabilities.providerStatus === "configured"
        ? { capabilities: availability.capabilities, type: "configured" }
        : { type: "not_configured" };
    case "not_configured":
      return { type: "not_configured" };
    case "failed":
      return { message: availability.message, type: "failed" };
    case "loading":
      return { type: "loading" };
  }
}

function speechOutputControlLabel(
  mode: SpeechOutputMode,
  playbackState: SpeechPlaybackState,
): string {
  switch (playbackState.type) {
    case "synthesizing":
      return "Stop preparing voice";
    case "speaking":
      return "Stop speaking";
    case "stopped":
      return "Voice stopped";
    case "failed":
      return `Voice playback failed: ${playbackState.message}`;
    case "idle":
      return `Voice output: ${outputModeLabels[mode]}`;
  }
}

function usePaneTopBarPortalTarget(rootRef: RefObject<HTMLElement | null>): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const surfaceContainer = rootRef.current?.closest<HTMLElement>(".workspace-react-dom-surface");
    let portalContainer: HTMLElement | null = null;
    const syncPortalTarget = () => {
      const placement = paneTopBarPlacement(rootRef);
      if (!placement) {
        portalContainer?.remove();
        portalContainer = null;
        setTarget(null);
        return;
      }
      const { actionStrip, topBar } = placement;
      if (portalContainer?.parentElement === topBar) {
        return;
      }
      portalContainer?.remove();
      portalContainer = topBar.ownerDocument.createElement("span");
      portalContainer.className = "easy-button-pane-tools app-no-drag";
      portalContainer.dataset.easyButtonPaneTools = "true";
      topBar.insertBefore(portalContainer, actionStrip);
      setTarget(portalContainer);
    };
    syncPortalTarget();
    surfaceContainer?.addEventListener(reactDomSurfaceHostChangedEvent, syncPortalTarget);
    return () => {
      surfaceContainer?.removeEventListener(reactDomSurfaceHostChangedEvent, syncPortalTarget);
      portalContainer?.remove();
    };
  }, [rootRef]);
  return target;
}

function paneTopBarPlacement(rootRef: RefObject<HTMLElement | null>): {
  actionStrip: HTMLElement;
  topBar: HTMLElement;
} | null {
  const host = rootRef.current?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
  const topBar = host?.querySelector<HTMLElement>(".workspace-pane-top-bar");
  const actionStrip = topBar?.querySelector<HTMLElement>(".workspace-pane-action-strip");
  return topBar && actionStrip ? { actionStrip, topBar } : null;
}

function useHostSpeechOutputState(
  rootRef: RefObject<HTMLElement | null>,
  portalTarget: HTMLElement | null,
  availability: SpeechOutputAvailability,
  mode: SpeechOutputMode,
  playbackState: SpeechPlaybackState,
): void {
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('[data-testid="workspace-pane-host"]');
    if (!host) {
      return;
    }
    host.dataset.easyButtonOutputMode = mode;
    host.dataset.easyButtonPlayback = playbackState.type;
    host.dataset.easyButtonSpeechOutput = availability.type;
    return () => {
      delete host.dataset.easyButtonOutputMode;
      delete host.dataset.easyButtonPlayback;
      delete host.dataset.easyButtonSpeechOutput;
    };
  }, [availability.type, mode, playbackState.type, portalTarget, rootRef]);
}

function useDismissedSpeechPopover(
  open: boolean,
  setOpen: (open: boolean) => void,
  rootRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuRef, open, rootRef, setOpen]);
}
