import type {
  ConversationPaletteID,
  ConversationPresentationProfile,
  MasterVoiceSelection,
  NarratorVoiceDefault,
  SpeechCapabilities,
  SpeechVoiceID,
  VoiceSelectionRequest,
} from "@generated/backend";
import type {
  KnownRuntimeView,
  RuntimeConnectionStatus,
  RuntimeRegistrySnapshot,
} from "@shared/types";
import { conversationPaletteCatalog } from "@generated/backend";
import { Loader2, RotateCcw, Save, SlidersHorizontal, Volume2 } from "lucide-react";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";

import { hydrateConversationProjectionSnapshot } from "../stores/conversation-projection-runtime";
import { useRuntimeStore } from "../stores/runtime-store";
import type { SettingsFocusRequest } from "../stores/settings-navigation-store";
import {
  type ActiveRuntimeVoiceStatus,
  OpenAIVoiceConnectionCard,
} from "./openai-voice-connection-card";
import { SpeechProviderSelectionCard } from "./speech-provider-selection-card";
import { Button } from "./ui/button";

const automaticSelectionValue = "auto_distinct";

interface GlobalVoiceConfiguration {
  capabilities: SpeechCapabilities;
  master: MasterVoiceSelection;
  narratorDefault: NarratorVoiceDefault;
}

interface RuntimeKeyedConfiguration {
  configuration: GlobalVoiceConfiguration;
  runtimeKey: string;
}

interface RuntimeKeyedError {
  message: string;
  runtimeKey: string;
}

interface PresentationConfigurationSettingsState {
  activeRuntimeVoiceStatus: ActiveRuntimeVoiceStatus | null;
  configuration: GlobalVoiceConfiguration | null;
  error: string | null;
  onMasterUpdate: (master: MasterVoiceSelection) => void;
  onNarratorDefaultUpdate: (narratorDefault: NarratorVoiceDefault) => void;
}

export function PresentationConfigurationSettings({
  focusRequest = null,
}: {
  focusRequest?: SettingsFocusRequest | null;
}) {
  const state = usePresentationConfigurationSettingsState();

  return (
    <section className="grid gap-3" data-testid="presentation-configuration-settings">
      <SpeechProviderSelectionCard
        focusRequest={focusRequest?.target === "voice_provider_selection" ? focusRequest : null}
      />
      <OpenAIVoiceConnectionCard
        activeRuntimeVoiceStatus={state.activeRuntimeVoiceStatus}
        focusRequest={focusRequest?.target === "openai_voice_connection" ? focusRequest : null}
      />
      <PresentationConfigurationSettingsContent state={state} />
    </section>
  );
}

function PresentationConfigurationSettingsContent({
  state,
}: {
  state: PresentationConfigurationSettingsState;
}) {
  if (state.error) {
    return <ConfigurationMessage kind="error">{state.error}</ConfigurationMessage>;
  }
  if (state.configuration) {
    return (
      <GlobalVoiceConfigurationForm
        configuration={state.configuration}
        onMasterUpdate={state.onMasterUpdate}
        onNarratorDefaultUpdate={state.onNarratorDefaultUpdate}
      />
    );
  }
  return (
    <ConfigurationMessage kind="loading">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading voice configuration
    </ConfigurationMessage>
  );
}

function usePresentationConfigurationSettingsState(): PresentationConfigurationSettingsState {
  const runtimeSnapshot = useRuntimeStore((state) => state.snapshot);
  const activeRuntimeKey = connectedRuntimeConfigurationKey(runtimeSnapshot);
  const [configurationState, setConfigurationState] = useState<RuntimeKeyedConfiguration | null>(
    null,
  );
  const [errorState, setErrorState] = useState<RuntimeKeyedError | null>(null);
  const configuration = runtimeScopedConfiguration(configurationState, activeRuntimeKey);
  const error =
    runtimeScopedError(errorState, activeRuntimeKey) ??
    voiceConfigurationUnavailableMessage(runtimeSnapshot);
  const activeRemoteRuntime = activeRemoteRuntimeFromSnapshot(runtimeSnapshot);

  useLoadVoiceConfiguration(activeRuntimeKey, setConfigurationState, setErrorState);

  return {
    activeRuntimeVoiceStatus: activeRemoteRuntimeVoiceStatus({
      configuration,
      error,
      runtime: activeRemoteRuntime,
    }),
    configuration,
    error,
    onMasterUpdate: (master) => {
      if (!activeRuntimeKey) {
        return;
      }
      setConfigurationState((current) =>
        updateRuntimeScopedConfiguration(current, activeRuntimeKey, { master }),
      );
    },
    onNarratorDefaultUpdate: (narratorDefault) => {
      if (!activeRuntimeKey) {
        return;
      }
      setConfigurationState((current) =>
        updateRuntimeScopedConfiguration(current, activeRuntimeKey, { narratorDefault }),
      );
    },
  };
}

function useLoadVoiceConfiguration(
  activeRuntimeKey: string | null,
  setConfigurationState: Dispatch<SetStateAction<RuntimeKeyedConfiguration | null>>,
  setErrorState: Dispatch<SetStateAction<RuntimeKeyedError | null>>,
): void {
  useEffect(() => {
    if (!activeRuntimeKey) {
      setConfigurationState(null);
      setErrorState(null);
      return;
    }
    const speech = window.setta.speech;
    if (!speech.readMasterVoiceSelection || !speech.readNarratorVoiceDefault) {
      setConfigurationState(null);
      setErrorState({
        message: "Voice configuration is unavailable in this client.",
        runtimeKey: activeRuntimeKey,
      });
      return;
    }
    let active = true;
    setConfigurationState((current) => (current?.runtimeKey === activeRuntimeKey ? current : null));
    setErrorState(null);
    void Promise.all([
      speech.readCapabilities(),
      speech.readMasterVoiceSelection(),
      speech.readNarratorVoiceDefault(),
    ]).then(
      ([capabilities, master, narratorDefault]) => {
        if (active) {
          setConfigurationState({
            configuration: { capabilities, master, narratorDefault },
            runtimeKey: activeRuntimeKey,
          });
          setErrorState(null);
        }
      },
      (reason: unknown) => {
        if (active) {
          setErrorState({
            message: errorMessage(reason),
            runtimeKey: activeRuntimeKey,
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [activeRuntimeKey, setConfigurationState, setErrorState]);
}

export function connectedRuntimeConfigurationKey(
  snapshot: RuntimeRegistrySnapshot | null,
): string | null {
  if (!snapshot) {
    return null;
  }
  if (snapshot.connection.status !== "connected") {
    return null;
  }
  if (
    !snapshot.connection.runtimeId ||
    snapshot.connection.runtimeId !== snapshot.activeRuntimeId
  ) {
    return null;
  }
  return `${snapshot.connection.runtimeId}:${snapshot.connection.protocolVersion ?? ""}:${snapshot.connection.updatedAt}`;
}

function voiceConfigurationUnavailableMessage(
  snapshot: RuntimeRegistrySnapshot | null,
): string | null {
  if (!snapshot) {
    return null;
  }
  return (
    {
      connected: connectedRuntimeConfigurationKey(snapshot)
        ? null
        : "Runtime connection state is missing the active runtime.",
      connecting: null,
      disconnected: snapshot.connection.message,
      incompatible: snapshot.connection.message,
      mismatched: snapshot.connection.message,
      revoked: snapshot.connection.message,
      unreachable: snapshot.connection.message,
    } satisfies Record<RuntimeConnectionStatus, string | null>
  )[snapshot.connection.status];
}

function runtimeScopedConfiguration(
  state: RuntimeKeyedConfiguration | null,
  runtimeKey: string | null,
): GlobalVoiceConfiguration | null {
  if (!runtimeKey || state?.runtimeKey !== runtimeKey) {
    return null;
  }
  return state.configuration;
}

function runtimeScopedError(
  state: RuntimeKeyedError | null,
  runtimeKey: string | null,
): string | null {
  if (!runtimeKey || state?.runtimeKey !== runtimeKey) {
    return null;
  }
  return state.message;
}

function updateRuntimeScopedConfiguration(
  current: RuntimeKeyedConfiguration | null,
  runtimeKey: string,
  update: Partial<Pick<GlobalVoiceConfiguration, "master" | "narratorDefault">>,
): RuntimeKeyedConfiguration | null {
  if (current?.runtimeKey !== runtimeKey) {
    return current;
  }
  return {
    configuration: { ...current.configuration, ...update },
    runtimeKey: current.runtimeKey,
  };
}

function activeRemoteRuntimeFromSnapshot(
  snapshot: RuntimeRegistrySnapshot | null,
): KnownRuntimeView | null {
  if (!snapshot) {
    return null;
  }
  const activeRuntime =
    snapshot.runtimes.find((runtime) => runtime.runtimeId === snapshot.activeRuntimeId) ??
    snapshot.runtimes.find((runtime) => runtime.active) ??
    null;
  if (!activeRuntime || activeRuntime.isLocal) {
    return null;
  }
  return activeRuntime;
}

function activeRemoteRuntimeVoiceStatus({
  configuration,
  error,
  runtime,
}: {
  configuration: GlobalVoiceConfiguration | null;
  error: string | null;
  runtime: KnownRuntimeView | null;
}): ActiveRuntimeVoiceStatus | null {
  if (!runtime) {
    return null;
  }
  const connectionProviderStatus = runtimeConnectionVoiceProviderStatus(runtime.connectionStatus);
  if (connectionProviderStatus) {
    return {
      displayName: runtime.displayName,
      message: connectionProviderStatus === "unavailable" ? runtime.connectionMessage : null,
      providerStatus: connectionProviderStatus,
    };
  }
  if (error) {
    return {
      displayName: runtime.displayName,
      message: error,
      providerStatus: "unavailable",
    };
  }
  if (!configuration) {
    return {
      displayName: runtime.displayName,
      message: null,
      providerStatus: "loading",
    };
  }
  return {
    displayName: runtime.displayName,
    message: null,
    providerStatus: configuration.capabilities.providerStatus,
  };
}

function runtimeConnectionVoiceProviderStatus(
  status: RuntimeConnectionStatus,
): "loading" | "unavailable" | null {
  return (
    {
      connected: null,
      connecting: "loading",
      disconnected: "unavailable",
      incompatible: "unavailable",
      mismatched: "unavailable",
      revoked: "unavailable",
      unreachable: "unavailable",
    } satisfies Record<RuntimeConnectionStatus, "loading" | "unavailable" | null>
  )[status];
}

export function GlobalVoiceConfigurationForm({
  configuration,
  onMasterUpdate,
  onNarratorDefaultUpdate,
}: {
  configuration: GlobalVoiceConfiguration;
  onMasterUpdate: (value: MasterVoiceSelection) => void;
  onNarratorDefaultUpdate: (value: NarratorVoiceDefault) => void;
}) {
  const [masterDraft, setMasterDraft] = useState(() => voiceSelectionValue(configuration.master));
  const [narratorDraft, setNarratorDraft] = useState(() =>
    voiceSelectionValue(configuration.narratorDefault),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"master" | "narrator" | null>(null);

  useEffect(() => {
    setMasterDraft(voiceSelectionValue(configuration.master));
    setError(null);
  }, [configuration.master]);

  useEffect(() => {
    setNarratorDraft(voiceSelectionValue(configuration.narratorDefault));
    setError(null);
  }, [configuration.narratorDefault]);

  const masterDirty = masterDraft !== voiceSelectionValue(configuration.master);
  const narratorDirty = narratorDraft !== voiceSelectionValue(configuration.narratorDefault);

  const saveMaster = () => {
    const update = window.setta.speech.updateMasterVoiceSelection;
    if (!update || saving) {
      return;
    }
    setSaving("master");
    setError(null);
    void update(voiceSelectionRequest(masterDraft)).then(
      (value) => {
        onMasterUpdate(value);
        setSaving(null);
      },
      (reason: unknown) => {
        setError(errorMessage(reason));
        setSaving(null);
      },
    );
  };
  const saveNarratorDefault = () => {
    const update = window.setta.speech.updateNarratorVoiceDefault;
    if (!update || saving) {
      return;
    }
    setSaving("narrator");
    setError(null);
    void update(voiceSelectionRequest(narratorDraft)).then(
      (value) => {
        onNarratorDefaultUpdate(value);
        setSaving(null);
      },
      (reason: unknown) => {
        setError(errorMessage(reason));
        setSaving(null);
      },
    );
  };

  return (
    <section className="grid gap-3" data-testid="voice-selection-settings">
      <header className="flex min-h-8 items-start gap-2">
        <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-foreground">
            Voices and presentation
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Speaker choices are validated against the backend voice catalog.
          </p>
        </div>
      </header>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground" role="status">
          Voice catalog · {configuration.capabilities.voiceCatalog.voiceIds.length} voices
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        <VoiceConfigurationCard
          description={`Currently resolves to ${configuration.master.resolvedVoiceId ?? "no voice"}.`}
          disabled={saving !== null}
          label="Master voice"
          onChange={setMasterDraft}
          onReset={() => setMasterDraft(voiceSelectionValue(configuration.master))}
          onSave={saveMaster}
          saving={saving === "master"}
          selection={masterDraft}
          dirty={masterDirty}
          voices={configuration.capabilities.voiceCatalog.voiceIds}
        />
        <VoiceConfigurationCard
          description="Applied to new topic conversations; automatic mode resolves per conversation."
          disabled={saving !== null}
          label="Default narrator voice"
          onChange={setNarratorDraft}
          onReset={() => setNarratorDraft(voiceSelectionValue(configuration.narratorDefault))}
          onSave={saveNarratorDefault}
          saving={saving === "narrator"}
          selection={narratorDraft}
          dirty={narratorDirty}
          voices={configuration.capabilities.voiceCatalog.voiceIds}
        />
      </div>
    </section>
  );
}

function VoiceConfigurationCard({
  description,
  dirty,
  disabled,
  label,
  onChange,
  onReset,
  onSave,
  saving,
  selection,
  voices,
}: {
  description: string;
  dirty: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
  selection: string;
  voices: SpeechVoiceID[];
}) {
  return (
    <fieldset className="grid gap-2 rounded-sm border border-border bg-card/40 p-3">
      <legend className="sr-only">{label}</legend>
      <div>
        <h3 className="text-xs font-semibold text-foreground">{label}</h3>
        <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
      <label className="grid gap-1 text-[11px] text-muted-foreground">
        Selection
        <VoiceSelectionControl
          ariaLabel={`${label} selection`}
          disabled={disabled}
          onChange={onChange}
          selection={selection}
          voices={voices}
        />
      </label>
      <div className="flex justify-end gap-1">
        <Button disabled={!dirty || disabled} onClick={onReset} type="button">
          <RotateCcw className="h-3.5 w-3.5" />
          Revert
        </Button>
        <Button disabled={!dirty || disabled} onClick={onSave} type="button" variant="primary">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>
    </fieldset>
  );
}

export function ConversationPresentationConfiguration({
  archived,
  profile,
  workspaceId,
}: {
  archived: boolean;
  profile: ConversationPresentationProfile;
  workspaceId: string;
}) {
  const [voiceIds, setVoiceIds] = useState<SpeechVoiceID[]>([]);
  const [paletteDraft, setPaletteDraft] = useState(() => paletteSelectionValue(profile));
  const [voiceDraft, setVoiceDraft] = useState(() => voiceSelectionValueForProfile(profile));
  const [speechEnabled, setSpeechEnabled] = useState(profile.narratorSpeechEnabled);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void window.setta.speech.readCapabilities().then(
      (capabilities) => {
        if (active) {
          setVoiceIds(capabilities.voiceCatalog.voiceIds);
        }
      },
      (reason: unknown) => {
        if (active) {
          setError(errorMessage(reason));
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPaletteDraft(paletteSelectionValue(profile));
    setVoiceDraft(voiceSelectionValueForProfile(profile));
    setSpeechEnabled(profile.narratorSpeechEnabled);
    setError(null);
  }, [profile]);

  const settings = useMemo(
    () => ({
      narratorSpeechEnabled: speechEnabled,
      narratorVoiceSelection: voiceSelectionRequest(voiceDraft),
      paletteSelection: paletteSelectionRequest(paletteDraft),
    }),
    [paletteDraft, speechEnabled, voiceDraft],
  );
  const dirty =
    paletteDraft !== paletteSelectionValue(profile) ||
    voiceDraft !== voiceSelectionValueForProfile(profile) ||
    speechEnabled !== profile.narratorSpeechEnabled;
  const controlsDisabled = archived || saving;
  const voiceDisabled = controlsDisabled || voiceIds.length === 0;
  const resetDisabled = !dirty || controlsDisabled;
  const saveDisabled = resetDisabled || voiceIds.length === 0;

  const reset = () => {
    setPaletteDraft(paletteSelectionValue(profile));
    setVoiceDraft(voiceSelectionValueForProfile(profile));
    setSpeechEnabled(profile.narratorSpeechEnabled);
    setError(null);
  };
  const save = () => {
    if (archived || saving || !dirty) {
      return;
    }
    setSaving(true);
    setError(null);
    void window.setta.conversations
      .updatePresentation({
        conversationId: profile.conversationId,
        settings,
        workspaceId,
      })
      .then((updated) => {
        if (updated.conversationId !== profile.conversationId) {
          throw new Error("Updated presentation profile belongs to another conversation.");
        }
        return window.setta.conversations.read({
          conversationId: profile.conversationId,
          workspaceId,
        });
      })
      .then(
        (snapshot) => {
          hydrateConversationProjectionSnapshot(snapshot);
          setSaving(false);
        },
        (reason: unknown) => {
          setError(errorMessage(reason));
          setSaving(false);
        },
      );
  };

  return (
    <details
      className="conversation-presentation-config"
      data-testid="conversation-presentation-configuration"
    >
      <summary
        aria-label="Voice and color settings"
        className="conversation-presentation-config-trigger"
        title="Voice and color"
      >
        <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
      </summary>
      <div className="conversation-presentation-config-panel">
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Conversation color
          <select
            aria-label="Conversation color selection"
            className="h-8 rounded-sm border border-input bg-background px-2 text-xs text-foreground"
            disabled={controlsDisabled}
            onChange={(event) => setPaletteDraft(event.currentTarget.value)}
            value={paletteDraft}
          >
            <option value={automaticSelectionValue}>Automatic distinct</option>
            {conversationPaletteIDs.map((paletteId) => (
              <option key={paletteId} value={paletteId}>
                {titleCase(paletteId)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Narrator voice
          <VoiceSelectionControl
            ariaLabel="Conversation narrator voice selection"
            disabled={voiceDisabled}
            onChange={setVoiceDraft}
            selection={voiceDraft}
            voices={voiceIds}
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            aria-label="Speak narrator updates"
            checked={speechEnabled}
            disabled={controlsDisabled}
            onChange={(event) => setSpeechEnabled(event.currentTarget.checked)}
            type="checkbox"
          />
          Speak narrator updates
        </label>
        {error ? (
          <p className="text-[11px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-1">
          <Button disabled={resetDisabled} onClick={reset} type="button">
            Revert
          </Button>
          <Button disabled={saveDisabled} onClick={save} type="button" variant="primary">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </details>
  );
}

function VoiceSelectionControl({
  ariaLabel,
  disabled,
  onChange,
  selection,
  voices,
}: {
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  selection: string;
  voices: SpeechVoiceID[];
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="h-8 rounded-sm border border-input bg-background px-2 text-xs text-foreground"
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={selection}
    >
      <option value={automaticSelectionValue}>Automatic distinct</option>
      {voices.map((voiceId) => (
        <option key={voiceId} value={voiceId}>
          {titleCase(voiceId)}
        </option>
      ))}
    </select>
  );
}

function ConfigurationMessage({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "error" | "loading";
}) {
  return (
    <div
      className={
        kind === "error"
          ? "rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          : "flex items-center gap-2 rounded-sm border border-border bg-card/40 p-3 text-xs text-muted-foreground"
      }
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

const conversationPaletteIDs = Object.keys(conversationPaletteCatalog) as ConversationPaletteID[];

function paletteSelectionValue(profile: ConversationPresentationProfile): string {
  return profile.paletteSelection === "auto_distinct"
    ? automaticSelectionValue
    : requireSelectionID(profile.requestedPaletteId, "exact conversation palette");
}

function paletteSelectionRequest(value: string) {
  if (value === automaticSelectionValue) {
    return { requestedPaletteId: null, selection: "auto_distinct" as const };
  }
  if (!conversationPaletteIDs.includes(value as ConversationPaletteID)) {
    throw new Error(`Conversation palette ${value} is unavailable.`);
  }
  return {
    requestedPaletteId: value as ConversationPaletteID,
    selection: "exact" as const,
  };
}

function voiceSelectionValue(
  value: Pick<MasterVoiceSelection | NarratorVoiceDefault, "selection" | "requestedVoiceId">,
): string {
  return value.selection === "auto_distinct"
    ? automaticSelectionValue
    : requireSelectionID(value.requestedVoiceId, "exact voice");
}

function voiceSelectionValueForProfile(profile: ConversationPresentationProfile): string {
  return voiceSelectionValue({
    requestedVoiceId: profile.requestedNarratorVoiceId,
    selection: profile.narratorVoiceSelection,
  });
}

function voiceSelectionRequest(value: string): VoiceSelectionRequest {
  return value === automaticSelectionValue
    ? { requestedVoiceId: null, selection: "auto_distinct" }
    : { requestedVoiceId: value as SpeechVoiceID, selection: "exact" };
}

function requireSelectionID(value: string | null, label: string): string {
  if (!value) {
    throw new Error(`${label} is missing its requested ID.`);
  }
  return value;
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Presentation configuration failed.";
}
