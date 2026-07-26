import type { SpeechProvider } from "@generated/backend";
import type {
  LocalMacOSVoiceHealth,
  LocalMacOSVoiceModelDownloadStatus,
  SpeechProviderSelectionSettings,
} from "@shared/speech-ipc";
import {
  localMacOSSpeechProviderID,
  openAISpeechProviderID,
  supportedDesktopSpeechProviderIDs,
} from "@shared/speech-providers";
import { Check, CircleAlert, Download, Loader2, Mic2 } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import {
  completeSettingsNavigationRequest,
  type SettingsFocusRequest,
} from "../stores/settings-navigation-store";
import { SettaStatusBadge } from "./setta-status-badge";
import { Button } from "./ui/button";

const localMacOSProvider = localMacOSSpeechProviderID();
const openAIProvider = openAISpeechProviderID();
const defaultSupportedProviders: SpeechProvider[] = [localMacOSProvider, openAIProvider];
const localMacOSDownloadActionByStatus = {
  downloading: true,
  failed: true,
  idle: undefined,
  ready: false,
  unavailable: false,
} satisfies Record<LocalMacOSVoiceModelDownloadStatus["status"], boolean | undefined>;
const localMacOSHealthLabels = {
  helper_unavailable: "Helper unavailable",
  microphone_denied: "Microphone denied",
  missing_model: "Missing model",
  model_hash_mismatch: "Model mismatch",
  ready: "Ready",
  synthesis_unavailable: "Speech unavailable",
} satisfies Record<LocalMacOSVoiceHealth["status"], string>;
const localMacOSModelProblemStatuses = new Set<LocalMacOSVoiceHealth["status"]>([
  "missing_model",
  "model_hash_mismatch",
]);

interface SpeechProviderSelectionCardState {
  error: string | null;
  localHealth: LocalMacOSVoiceHealth | null;
  localModelDownload: LocalMacOSVoiceModelDownloadStatus | null;
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
    localModelDownload: null,
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
        localModelDownload: null,
        selection: null,
      });
      return;
    }
    void Promise.all([
      speech.readProviderSelection(),
      speech
        .readLocalMacOSVoiceHealth?.()
        .catch((reason: unknown) => unavailableLocalHealth(reason)),
      speech
        .readLocalMacOSVoiceModelDownload?.()
        .catch((reason: unknown) => unavailableLocalModelDownload(reason)),
    ]).then(
      ([selection, localHealth, localModelDownload]) => {
        setState({
          error: null,
          localHealth: localHealth ?? null,
          localModelDownload: localModelDownload ?? null,
          selection,
        });
      },
      (reason: unknown) => {
        setState({
          error: errorMessage(reason),
          localHealth: null,
          localModelDownload: null,
          selection: null,
        });
      },
    );
  };

  useEffect(() => {
    load();
    const unsubscribeProvider = rendererSpeechAPI()?.onProviderSelectionChanged?.((selection) => {
      setState((current) => ({ ...current, error: null, selection }));
    });
    const unsubscribeDownload = rendererSpeechAPI()?.onLocalMacOSVoiceModelDownloadChanged?.(
      (localModelDownload) => {
        setState((current) => ({ ...current, localModelDownload }));
        if (localModelDownload.status === "ready") {
          load();
        }
      },
    );
    return () => {
      unsubscribeProvider?.();
      unsubscribeDownload?.();
    };
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

  const downloadLocalModel = () => {
    const startDownload = rendererSpeechAPI()?.startLocalMacOSVoiceModelDownload;
    if (!startDownload || updatingProvider !== null) {
      return;
    }
    setState((current) => ({ ...current, error: null }));
    void startDownload().then(
      (localModelDownload) => {
        setState((current) => ({ ...current, error: null, localModelDownload }));
        if (localModelDownload.status === "ready") {
          load();
        }
      },
      (reason: unknown) => {
        setState((current) => ({ ...current, error: errorMessage(reason) }));
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
      localModelDownload={state.localModelDownload}
      onDownloadLocalModel={downloadLocalModel}
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
  localModelDownload = null,
  onDownloadLocalModel = noop,
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
  localModelDownload?: LocalMacOSVoiceModelDownloadStatus | null;
  onDownloadLocalModel?: () => void;
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
        localModelDownload={localModelDownload}
        canUpdateProvider={canUpdateProvider}
        onDownloadLocalModel={onDownloadLocalModel}
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
        <SettaStatusBadge tone="success">
          {providerDisplayName(selection.provider)}
        </SettaStatusBadge>
      ) : (
        <SettaStatusBadge tone="info">Checking</SettaStatusBadge>
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
  localModelDownload,
  onSelectProvider,
  onDownloadLocalModel,
  selection,
  supportedProviders,
  updatingProvider,
}: {
  canUpdateProvider: boolean;
  error: string | null;
  localHealth: LocalMacOSVoiceHealth | null;
  localModelDownload: LocalMacOSVoiceModelDownloadStatus | null;
  onSelectProvider: (provider: SpeechProvider) => void;
  onDownloadLocalModel: () => void;
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
        localModelDownload={localModelDownload}
        onDownloadLocalModel={onDownloadLocalModel}
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
  localModelDownload,
  onDownloadLocalModel,
  onSelectProvider,
  state,
  supportedProviders,
  updatingProvider,
}: {
  localHealth: LocalMacOSVoiceHealth | null;
  localModelDownload: LocalMacOSVoiceModelDownloadStatus | null;
  onDownloadLocalModel: () => void;
  onSelectProvider: (provider: SpeechProvider) => void;
  state: ProviderOptionState;
  supportedProviders: SpeechProvider[];
  updatingProvider: SpeechProvider | null;
}) {
  if (!supportedProviders.includes(localMacOSProvider)) {
    return null;
  }
  const modelDownloadAction = localMacOSModelDownloadAction(
    localHealth,
    localModelDownload,
    onDownloadLocalModel,
  );
  return (
    <ProviderOption
      defaultProvider={state.defaultProvider}
      description={localMacOSHealthSummary(localHealth, localModelDownload)}
      disabled={state.disabled}
      onSelect={() => onSelectProvider(localMacOSProvider)}
      provider={localMacOSProvider}
      selectedProvider={state.selectedProvider}
      secondaryAction={modelDownloadAction}
      status={localMacOSHealthLabel(localHealth, localModelDownload)}
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
      <Button
        disabled={updatingProvider !== null}
        onClick={onRefresh}
        size="sm"
        type="button"
        variant="outline"
      >
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
  secondaryAction,
  selectedProvider,
  status,
  updating,
}: {
  defaultProvider: SpeechProvider | null;
  description: string;
  disabled: boolean;
  onSelect: () => void;
  provider: SpeechProvider;
  secondaryAction?: ReactNode;
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
          {isDefault ? <SettaStatusBadge tone="neutral">Default</SettaStatusBadge> : null}
          <SettaStatusBadge tone={selected ? "success" : "neutral"}>{status}</SettaStatusBadge>
        </span>
      </div>
      <div className="flex justify-end">
        <div className="flex flex-wrap justify-end gap-2">
          {secondaryAction}
          <Button disabled={disabled || selected} onClick={onSelect} size="sm" type="button">
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
      </div>
    </section>
  );
}

function localMacOSModelDownloadAction(
  health: LocalMacOSVoiceHealth | null,
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
  onDownload: () => void,
): ReactNode {
  if (!localMacOSNeedsModelDownload(health, downloadStatus)) {
    return null;
  }
  if (downloadStatus?.status === "downloading") {
    return (
      <Button disabled size="sm" type="button" variant="outline">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {downloadPercent(downloadStatus)}%
      </Button>
    );
  }
  return (
    <Button onClick={onDownload} size="sm" type="button" variant="outline">
      <Download className="h-3.5 w-3.5" />
      {downloadStatus?.status === "failed" || health?.status === "model_hash_mismatch"
        ? "Retry model"
        : "Download model"}
    </Button>
  );
}

function localMacOSNeedsModelDownload(
  health: LocalMacOSVoiceHealth | null,
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): boolean {
  const downloadActionRequired =
    downloadStatus === null ? undefined : localMacOSDownloadActionByStatus[downloadStatus.status];
  return downloadActionRequired ?? localMacOSModelProblemStatuses.has(health?.status ?? "ready");
}

function localMacOSHealthLabel(
  health: LocalMacOSVoiceHealth | null,
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): string {
  const downloadLabel = localMacOSModelDownloadHealthLabel(health, downloadStatus);
  return downloadLabel ?? (health === null ? "Checking" : localMacOSHealthLabels[health.status]);
}

function localMacOSModelDownloadHealthLabel(
  health: LocalMacOSVoiceHealth | null,
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): string | null {
  if (downloadStatus === null) {
    return null;
  }
  switch (downloadStatus.status) {
    case "downloading":
      return "Downloading";
    case "failed":
      return "Download failed";
    case "ready":
      return health?.status === "ready" ? null : "Model ready";
    case "idle":
    case "unavailable":
      return null;
    default:
      return assertNever(downloadStatus);
  }
}

function localMacOSHealthSummary(
  health: LocalMacOSVoiceHealth | null,
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): string {
  const downloadSummary = localMacOSModelDownloadHealthSummary(health, downloadStatus);
  return downloadSummary ?? localMacOSBaseHealthSummary(health, downloadStatus);
}

function localMacOSModelDownloadHealthSummary(
  health: LocalMacOSVoiceHealth | null,
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): string | null {
  if (downloadStatus === null) {
    return null;
  }
  switch (downloadStatus.status) {
    case "downloading":
      return `Downloading ${downloadStatus.modelName} voice model (${formatBytes(downloadStatus.bytesDownloaded)} of ${formatBytes(downloadStatus.bytesTotal)}).`;
    case "failed":
      return downloadStatus.message;
    case "ready":
      return health?.status === "ready"
        ? null
        : "Local voice model is verified. Checking helper readiness.";
    case "idle":
    case "unavailable":
      return null;
    default:
      return assertNever(downloadStatus);
  }
}

function localMacOSBaseHealthSummary(
  health: LocalMacOSVoiceHealth | null,
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): string {
  if (health === null) {
    return "Checking local helper, model, microphone, and system voice availability.";
  }
  switch (health.status) {
    case "ready":
      return "Uses the installed helper, verified Whisper model, microphone, and system voices.";
    case "missing_model":
      return localMacOSMissingModelSummary(downloadStatus);
    case "model_hash_mismatch":
      return localMacOSModelHashMismatchSummary(downloadStatus);
    case "helper_unavailable":
    case "microphone_denied":
    case "synthesis_unavailable":
      return health.message;
    default:
      return assertNever(health);
  }
}

function localMacOSMissingModelSummary(
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): string {
  if (downloadStatus?.status === "idle") {
    return `Download the ${downloadStatus.modelName} voice model (${formatBytes(downloadStatus.bytesTotal)}) to enable local transcription.`;
  }
  return "Download the local voice model to enable local transcription.";
}

function localMacOSModelHashMismatchSummary(
  downloadStatus: LocalMacOSVoiceModelDownloadStatus | null,
): string {
  if (downloadStatus?.status === "idle") {
    return `Replace the local voice model with Setta's verified ${downloadStatus.modelName} model.`;
  }
  return "Replace the local voice model with Setta's verified model.";
}

function unavailableLocalHealth(reason: unknown): LocalMacOSVoiceHealth {
  return {
    helperPath: null,
    message: errorMessage(reason),
    provider: localMacOSProvider,
    status: "helper_unavailable",
  };
}

function unavailableLocalModelDownload(reason: unknown): LocalMacOSVoiceModelDownloadStatus {
  return {
    message: errorMessage(reason),
    provider: localMacOSProvider,
    status: "unavailable",
  };
}

function downloadPercent(
  status: Extract<LocalMacOSVoiceModelDownloadStatus, { status: "downloading" }>,
) {
  return Math.max(0, Math.min(100, Math.floor((status.bytesDownloaded / status.bytesTotal) * 100)));
}

function formatBytes(value: number): string {
  const mib = value / (1024 * 1024);
  return `${Math.round(mib)} MB`;
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

function noop(): void {}
