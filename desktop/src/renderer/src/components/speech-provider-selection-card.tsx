import type { SpeechProvider } from "@generated/backend";
import type { LocalMacOSVoiceHealth, SpeechProviderSelectionSettings } from "@shared/speech-ipc";
import {
  localMacOSSpeechProviderID,
  openAISpeechProviderID,
  supportedDesktopSpeechProviderIDs,
} from "@shared/speech-providers";
import { Check, CircleAlert, Loader2, Mic2 } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import {
  completeSettingsNavigationRequest,
  type SettingsFocusRequest,
} from "../stores/settings-navigation-store";
import { Button } from "./ui/button";

const localMacOSProvider = localMacOSSpeechProviderID();
const openAIProvider = openAISpeechProviderID();
const defaultSupportedProviders: SpeechProvider[] = [localMacOSProvider, openAIProvider];

interface SpeechProviderSelectionCardState {
  error: string | null;
  localHealth: LocalMacOSVoiceHealth | null;
  selection: SpeechProviderSelectionSettings | null;
}

export function SpeechProviderSelectionCard({
  focusRequest = null,
}: {
  focusRequest?: SettingsFocusRequest | null;
}) {
  const [state, setState] = useState<SpeechProviderSelectionCardState>({
    error: null,
    localHealth: null,
    selection: null,
  });
  const [updatingProvider, setUpdatingProvider] = useState<SpeechProvider | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

  const load = () => {
    const speech = rendererSpeechAPI();
    if (!speech?.readProviderSelection) {
      setState({
        error: "Voice provider selection is unavailable in this client.",
        localHealth: null,
        selection: null,
      });
      return;
    }
    void Promise.all([
      speech.readProviderSelection(),
      speech
        .readLocalMacOSVoiceHealth?.()
        .catch((reason: unknown) => unavailableLocalHealth(reason)),
    ]).then(
      ([selection, localHealth]) => {
        setState({
          error: null,
          localHealth: localHealth ?? null,
          selection,
        });
      },
      (reason: unknown) => {
        setState({
          error: errorMessage(reason),
          localHealth: null,
          selection: null,
        });
      },
    );
  };

  useEffect(() => {
    load();
    return rendererSpeechAPI()?.onProviderSelectionChanged?.((selection) => {
      setState((current) => ({ ...current, error: null, selection }));
    });
  }, []);

  useEffect(() => {
    if (focusRequest?.target === "voice_provider_selection") {
      cardRef.current?.focus();
      completeSettingsNavigationRequest(focusRequest.requestId);
    }
  }, [focusRequest?.requestId, focusRequest?.target]);

  const selectProvider = (provider: SpeechProvider) => {
    const update = rendererSpeechAPI()?.updateProviderSelection;
    if (!update || updatingProvider !== null) {
      return;
    }
    setUpdatingProvider(provider);
    setState((current) => ({ ...current, error: null }));
    void update({ provider }).then(
      (selection) => {
        setState((current) => ({ ...current, error: null, selection }));
        setUpdatingProvider(null);
      },
      (reason: unknown) => {
        setState((current) => ({ ...current, error: errorMessage(reason) }));
        setUpdatingProvider(null);
      },
    );
  };

  return (
    <SpeechProviderSelectionCardView
      cardRef={cardRef}
      canUpdateProvider={Boolean(rendererSpeechAPI()?.updateProviderSelection)}
      error={state.error}
      fallbackSupportedProviders={supportedProvidersForRenderer()}
      localHealth={state.localHealth}
      onRefresh={load}
      onSelectProvider={selectProvider}
      selection={state.selection}
      updatingProvider={updatingProvider}
    />
  );
}

export function SpeechProviderSelectionCardView({
  cardRef,
  canUpdateProvider = true,
  error,
  fallbackSupportedProviders = defaultSupportedProviders,
  localHealth,
  onRefresh,
  onSelectProvider,
  selection,
  updatingProvider,
}: {
  cardRef?: Ref<HTMLElement>;
  canUpdateProvider?: boolean;
  error: string | null;
  fallbackSupportedProviders?: SpeechProvider[];
  localHealth: LocalMacOSVoiceHealth | null;
  onRefresh: () => void;
  onSelectProvider: (provider: SpeechProvider) => void;
  selection: SpeechProviderSelectionSettings | null;
  updatingProvider: SpeechProvider | null;
}) {
  const supportedProviders = selection?.supportedProviders ?? fallbackSupportedProviders;
  return (
    <article
      className="grid gap-3 rounded-sm border border-border bg-card/40 p-3 outline-none focus-visible:border-accent focus-visible:bg-card/60"
      data-testid="speech-provider-selection-card"
      ref={cardRef}
      tabIndex={-1}
    >
      <SpeechProviderSelectionHeader selection={selection} />
      <SpeechProviderSelectionError error={error} />
      <ProviderOptions
        error={error}
        localHealth={localHealth}
        canUpdateProvider={canUpdateProvider}
        onSelectProvider={onSelectProvider}
        selection={selection}
        supportedProviders={supportedProviders}
        updatingProvider={updatingProvider}
      />
      <SpeechProviderSelectionLoading error={error} selection={selection} />
      <SpeechProviderSelectionRetry
        error={error}
        onRefresh={onRefresh}
        updatingProvider={updatingProvider}
      />
    </article>
  );
}

function SpeechProviderSelectionHeader({
  selection,
}: {
  selection: SpeechProviderSelectionSettings | null;
}) {
  return (
    <header className="flex min-h-8 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <Mic2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-xs font-semibold tracking-wide text-foreground">Voice provider</h2>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Local macOS is the default on supported Macs. OpenAI is an optional cloud provider.
          </p>
        </div>
      </div>
      {selection ? (
        <ProviderBadge label={providerDisplayName(selection.provider)} tone="selected" />
      ) : (
        <ProviderBadge label="Checking" tone="pending" />
      )}
    </header>
  );
}

function SpeechProviderSelectionError({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }
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

function ProviderOptions({
  canUpdateProvider,
  error,
  localHealth,
  onSelectProvider,
  selection,
  supportedProviders,
  updatingProvider,
}: {
  canUpdateProvider: boolean;
  error: string | null;
  localHealth: LocalMacOSVoiceHealth | null;
  onSelectProvider: (provider: SpeechProvider) => void;
  selection: SpeechProviderSelectionSettings | null;
  supportedProviders: SpeechProvider[];
  updatingProvider: SpeechProvider | null;
}) {
  const state = providerOptionState({
    canUpdateProvider,
    error,
    selection,
    updatingProvider,
  });
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <LocalProviderOption
        localHealth={localHealth}
        onSelectProvider={onSelectProvider}
        state={state}
        supportedProviders={supportedProviders}
        updatingProvider={updatingProvider}
      />
      <OpenAIProviderOption
        onSelectProvider={onSelectProvider}
        state={state}
        supportedProviders={supportedProviders}
        updatingProvider={updatingProvider}
      />
    </div>
  );
}

interface ProviderOptionState {
  defaultProvider: SpeechProvider | null;
  disabled: boolean;
  selectedProvider: SpeechProvider | null;
}

function providerOptionState({
  canUpdateProvider,
  error,
  selection,
  updatingProvider,
}: {
  canUpdateProvider: boolean;
  error: string | null;
  selection: SpeechProviderSelectionSettings | null;
  updatingProvider: SpeechProvider | null;
}): ProviderOptionState {
  const canSelectAfterLoad = selection !== null || error !== null;
  return {
    defaultProvider: selection?.defaultProvider ?? null,
    disabled: !canUpdateProvider || !canSelectAfterLoad || updatingProvider !== null,
    selectedProvider: selection?.provider ?? null,
  };
}

function LocalProviderOption({
  localHealth,
  onSelectProvider,
  state,
  supportedProviders,
  updatingProvider,
}: {
  localHealth: LocalMacOSVoiceHealth | null;
  onSelectProvider: (provider: SpeechProvider) => void;
  state: ProviderOptionState;
  supportedProviders: SpeechProvider[];
  updatingProvider: SpeechProvider | null;
}) {
  if (!supportedProviders.includes(localMacOSProvider)) {
    return null;
  }
  return (
    <ProviderOption
      defaultProvider={state.defaultProvider}
      description={localMacOSHealthSummary(localHealth)}
      disabled={state.disabled}
      onSelect={() => onSelectProvider(localMacOSProvider)}
      provider={localMacOSProvider}
      selectedProvider={state.selectedProvider}
      status={localMacOSHealthLabel(localHealth)}
      updating={updatingProvider === localMacOSProvider}
    />
  );
}

function OpenAIProviderOption({
  onSelectProvider,
  state,
  supportedProviders,
  updatingProvider,
}: {
  onSelectProvider: (provider: SpeechProvider) => void;
  state: ProviderOptionState;
  supportedProviders: SpeechProvider[];
  updatingProvider: SpeechProvider | null;
}) {
  if (!supportedProviders.includes(openAIProvider)) {
    return null;
  }
  return (
    <ProviderOption
      defaultProvider={state.defaultProvider}
      description="Uses your saved OpenAI API key for cloud transcription and speech."
      disabled={state.disabled}
      onSelect={() => onSelectProvider(openAIProvider)}
      provider={openAIProvider}
      selectedProvider={state.selectedProvider}
      status="Cloud"
      updating={updatingProvider === openAIProvider}
    />
  );
}

function SpeechProviderSelectionLoading({
  error,
  selection,
}: {
  error: string | null;
  selection: SpeechProviderSelectionSettings | null;
}) {
  if (selection !== null || error) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading voice provider
    </div>
  );
}

function SpeechProviderSelectionRetry({
  error,
  onRefresh,
  updatingProvider,
}: {
  error: string | null;
  onRefresh: () => void;
  updatingProvider: SpeechProvider | null;
}) {
  if (!error) {
    return null;
  }
  return (
    <div className="flex justify-end">
      <Button disabled={updatingProvider !== null} onClick={onRefresh} type="button">
        Retry
      </Button>
    </div>
  );
}

function ProviderOption({
  defaultProvider,
  description,
  disabled,
  onSelect,
  provider,
  selectedProvider,
  status,
  updating,
}: {
  defaultProvider: SpeechProvider | null;
  description: string;
  disabled: boolean;
  onSelect: () => void;
  provider: SpeechProvider;
  selectedProvider: SpeechProvider | null;
  status: string;
  updating: boolean;
}) {
  const selected = selectedProvider === provider;
  const isDefault = defaultProvider === provider;
  return (
    <section
      className={cn(
        "grid gap-2 rounded-sm border p-3",
        selected ? "border-primary bg-primary/10" : "border-border bg-background/60",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-foreground">{providerDisplayName(provider)}</h3>
          <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
        </div>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {isDefault ? <ProviderBadge label="Default" tone="muted" /> : null}
          <ProviderBadge label={status} tone={selected ? "selected" : "muted"} />
        </span>
      </div>
      <div className="flex justify-end">
        <Button disabled={disabled || selected} onClick={onSelect} type="button">
          {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {selected ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Selected
            </>
          ) : (
            `Use ${providerDisplayName(provider)}`
          )}
        </Button>
      </div>
    </section>
  );
}

function ProviderBadge({ label, tone }: { label: string; tone: "muted" | "pending" | "selected" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
        tone === "selected" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "pending" && "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        tone === "muted" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function localMacOSHealthLabel(health: LocalMacOSVoiceHealth | null): string {
  if (!health) {
    return "Checking";
  }
  switch (health.status) {
    case "ready":
      return "Ready";
    case "missing_model":
      return "Missing model";
    case "model_hash_mismatch":
      return "Model mismatch";
    case "helper_unavailable":
      return "Helper unavailable";
    case "microphone_denied":
      return "Microphone denied";
    case "synthesis_unavailable":
      return "Speech unavailable";
    default:
      return assertNever(health);
  }
}

function localMacOSHealthSummary(health: LocalMacOSVoiceHealth | null): string {
  if (!health) {
    return "Checking local helper, model, microphone, and system voice availability.";
  }
  switch (health.status) {
    case "ready":
      return "Uses the installed helper, verified Whisper model, microphone, and system voices.";
    case "missing_model":
    case "model_hash_mismatch":
    case "helper_unavailable":
    case "microphone_denied":
    case "synthesis_unavailable":
      return health.message;
    default:
      return assertNever(health);
  }
}

function unavailableLocalHealth(reason: unknown): LocalMacOSVoiceHealth {
  return {
    helperPath: null,
    message: errorMessage(reason),
    provider: localMacOSProvider,
    status: "helper_unavailable",
  };
}

function providerDisplayName(provider: SpeechProvider): string {
  switch (provider) {
    case "local_macos":
      return "Local macOS";
    case "openai":
      return "OpenAI";
    default:
      return assertNever(provider);
  }
}

function supportedProvidersForRenderer(): SpeechProvider[] {
  const platform = rendererAppPlatform();
  return platform ? supportedDesktopSpeechProviderIDs(platform) : defaultSupportedProviders;
}

function rendererAppPlatform() {
  if (typeof window === "undefined" || !window.setta) {
    return null;
  }
  return window.setta.app.platform;
}

function rendererSpeechAPI(): (typeof window.setta)["speech"] | null {
  if (typeof window === "undefined" || !window.setta) {
    return null;
  }
  return window.setta.speech;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Voice provider selection failed.";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled voice provider value: ${JSON.stringify(value)}`);
}
