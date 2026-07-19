import type { LocalMacOSVoiceListenerSettings } from "@shared/speech-ipc";
import { CircleAlert, Loader2, Mic2 } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";

import {
  completeSettingsNavigationRequest,
  type SettingsFocusRequest,
} from "../stores/settings-navigation-store";
import { Button } from "./ui/button";

interface LocalMacOSAlwaysListeningCardState {
  error: string | null;
  settings: LocalMacOSVoiceListenerSettings | null;
}

export function LocalMacOSAlwaysListeningCard({
  focusRequest = null,
}: {
  focusRequest?: SettingsFocusRequest | null;
}) {
  const [state, setState] = useState<LocalMacOSAlwaysListeningCardState>({
    error: null,
    settings: null,
  });
  const [updating, setUpdating] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);

  const load = () => {
    const read = rendererSpeechAPI()?.readLocalMacOSVoiceListenerSettings;
    if (!read) {
      setState({
        error: "Always listening is unavailable in this client.",
        settings: null,
      });
      return;
    }
    void read().then(
      (settings) => setState({ error: null, settings }),
      (reason: unknown) => setState({ error: errorMessage(reason), settings: null }),
    );
  };

  useEffect(() => {
    load();
    const unsubscribe = rendererSpeechAPI()?.onLocalMacOSVoiceListenerChanged?.((event) => {
      setState({ error: null, settings: event.settings });
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (focusRequest?.target === "local_macos_always_listening") {
      cardRef.current?.focus();
      completeSettingsNavigationRequest(focusRequest.requestId);
    }
  }, [focusRequest?.requestId, focusRequest?.target]);

  const updateEnabled = (enabled: boolean) => {
    const update = rendererSpeechAPI()?.updateLocalMacOSVoiceListenerSettings;
    if (!update || updating) {
      return;
    }
    setUpdating(true);
    setState((current) => ({ ...current, error: null }));
    void update({ enabled }).then(
      (settings) => {
        setState({ error: null, settings });
        setUpdating(false);
      },
      (reason: unknown) => {
        setState((current) => ({ ...current, error: errorMessage(reason) }));
        setUpdating(false);
      },
    );
  };

  const startLocalModelDownload = () => {
    const download = rendererSpeechAPI()?.startLocalMacOSVoiceModelDownload;
    if (!download || updating) {
      return;
    }
    setUpdating(true);
    setState((current) => ({ ...current, error: null }));
    void download().then(
      () => {
        load();
        setUpdating(false);
      },
      (reason: unknown) => {
        setState((current) => ({ ...current, error: errorMessage(reason) }));
        setUpdating(false);
      },
    );
  };

  return (
    <LocalMacOSAlwaysListeningCardView
      cardRef={cardRef}
      error={state.error}
      onDownloadLocalModel={startLocalModelDownload}
      onToggle={updateEnabled}
      settings={state.settings}
      updating={updating}
    />
  );
}

export function LocalMacOSAlwaysListeningCardView({
  cardRef,
  error,
  onDownloadLocalModel,
  onToggle,
  settings,
  updating,
}: {
  cardRef?: Ref<HTMLElement>;
  error: string | null;
  onDownloadLocalModel: () => void;
  onToggle: (enabled: boolean) => void;
  settings: LocalMacOSVoiceListenerSettings | null;
  updating: boolean;
}) {
  const model = alwaysListeningCardModel(settings, updating);
  return (
    <article
      className="grid gap-3 rounded-sm border border-border bg-card/40 p-3 outline-none focus-visible:border-accent focus-visible:bg-card/60"
      data-testid="local-macos-always-listening-card"
      ref={cardRef}
      tabIndex={-1}
    >
      <header className="flex min-h-8 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Mic2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">
              Always listening
            </h2>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Wake with Hey Setta through the local macOS voice engine.
            </p>
          </div>
        </div>
        <AlwaysListeningBadge settings={settings} updating={updating} />
      </header>
      {error ? <AlwaysListeningError error={error} /> : null}
      {model.unavailable ? (
        <AlwaysListeningUnavailablePanel
          onDownloadLocalModel={onDownloadLocalModel}
          settings={model.unavailable}
          updating={updating}
        />
      ) : null}
      <label className="flex min-w-0 items-center justify-between gap-3 rounded-sm border border-border bg-background/60 p-3 text-xs">
        <span className="min-w-0">
          <span className="block font-medium text-foreground">Listen for Hey Setta</span>
          <span className="block text-[11px] leading-4 text-muted-foreground">
            {model.description}
          </span>
        </span>
        <input
          checked={model.enabled}
          className="h-4 w-4 shrink-0 accent-primary"
          disabled={model.disabled}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          type="checkbox"
        />
      </label>
    </article>
  );
}

function AlwaysListeningUnavailablePanel({
  onDownloadLocalModel,
  settings,
  updating,
}: {
  onDownloadLocalModel: () => void;
  settings: Extract<LocalMacOSVoiceListenerSettings["availability"], { status: "unavailable" }>;
  updating: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-background/60 p-2 text-xs text-muted-foreground">
      <span className="min-w-0 break-words">{settings.message}</span>
      {settings.setupAction === "download_local_macos_voice_model" ? (
        <Button disabled={updating} onClick={onDownloadLocalModel} type="button">
          {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Download model
        </Button>
      ) : null}
    </div>
  );
}

function AlwaysListeningBadge({
  settings,
  updating,
}: {
  settings: LocalMacOSVoiceListenerSettings | null;
  updating: boolean;
}) {
  const label = updating
    ? "Updating"
    : settings === null
      ? "Checking"
      : settings.availability.status === "unavailable"
        ? "Unavailable"
        : settings.enabled
          ? listenerStateLabel(settings.state.status)
          : "Off";
  return (
    <span className="inline-flex shrink-0 items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {updating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
      {label}
    </span>
  );
}

function AlwaysListeningError({ error }: { error: string }) {
  return (
    <div
      className="flex min-w-0 items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
      role="alert"
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{error}</span>
    </div>
  );
}

function alwaysListeningCardModel(
  settings: LocalMacOSVoiceListenerSettings | null,
  updating: boolean,
) {
  const unavailable = unavailableSettings(settings);
  const enabled = settings?.enabled ?? false;
  return {
    description: enabled ? listenerStateLabel(settings?.state.status ?? "armed") : "Off",
    disabled: updating || settings === null || unavailable !== null,
    enabled,
    unavailable,
  };
}

function unavailableSettings(settings: LocalMacOSVoiceListenerSettings | null) {
  return settings?.availability.status === "unavailable" ? settings.availability : null;
}

const listenerStateLabels = {
  armed: "Armed",
  arming: "Arming",
  candidate_end: "Recording",
  capturing: "Recording",
  disabled: "Off",
  engine_failed: "Needs attention",
  finalizing: "Finalizing",
  local_voice_not_ready: "Needs attention",
  microphone_denied: "Needs attention",
  paused_for_manual_capture: "Paused for manual voice",
  paused_for_playback: "Paused for playback",
  submitting: "Submitting",
  waiting_for_message_speech: "Wake detected",
  wake_detected: "Wake detected",
} satisfies Record<LocalMacOSVoiceListenerSettings["state"]["status"], string>;

function listenerStateLabel(status: LocalMacOSVoiceListenerSettings["state"]["status"]): string {
  return listenerStateLabels[status];
}

function rendererSpeechAPI(): (typeof window.setta)["speech"] | null {
  if (typeof window === "undefined" || !window.setta) {
    return null;
  }
  return window.setta.speech;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Always listening failed.";
}
