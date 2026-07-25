import type {
  DirectorVoiceSelection,
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
import { Loader2, RotateCcw, Save, Volume2 } from "lucide-react";
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from "react";

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
  director: DirectorVoiceSelection;
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

interface VoiceConfigurationSettingsState {
  activeRuntimeVoiceStatus: ActiveRuntimeVoiceStatus | null;
  configuration: GlobalVoiceConfiguration | null;
  error: string | null;
  onDirectorUpdate: (director: DirectorVoiceSelection) => void;
  onNarratorDefaultUpdate: (narratorDefault: NarratorVoiceDefault) => void;
}

export function VoiceConfigurationSettings({
  focusRequest = null,
}: {
  focusRequest?: SettingsFocusRequest | null;
}) {
  const state = useVoiceConfigurationSettingsState();

  return (
    <section className="grid gap-3" data-testid="voice-configuration-settings">
      <SpeechProviderSelectionCard
        focusRequest={focusRequest?.target === "voice_provider_selection" ? focusRequest : null}
      />
      <OpenAIVoiceConnectionCard
        activeRuntimeVoiceStatus={state.activeRuntimeVoiceStatus}
        focusRequest={focusRequest?.target === "openai_voice_connection" ? focusRequest : null}
      />
      <VoiceConfigurationSettingsContent state={state} />
    </section>
  );
}

function VoiceConfigurationSettingsContent({ state }: { state: VoiceConfigurationSettingsState }) {
  if (state.error) {
    return <ConfigurationMessage kind="error">{state.error}</ConfigurationMessage>;
  }
  if (state.configuration) {
    return (
      <GlobalVoiceConfigurationForm
        configuration={state.configuration}
        onDirectorUpdate={state.onDirectorUpdate}
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

function useVoiceConfigurationSettingsState(): VoiceConfigurationSettingsState {
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
    onDirectorUpdate: (director) => {
      if (!activeRuntimeKey) {
        return;
      }
      setConfigurationState((current) =>
        updateRuntimeScopedConfiguration(current, activeRuntimeKey, { director }),
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
    if (!speech.readDirectorVoiceSelection || !speech.readNarratorVoiceDefault) {
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
      speech.readDirectorVoiceSelection(),
      speech.readNarratorVoiceDefault(),
    ]).then(
      ([capabilities, director, narratorDefault]) => {
        if (active) {
          setConfigurationState({
            configuration: { capabilities, director, narratorDefault },
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
  update: Partial<Pick<GlobalVoiceConfiguration, "director" | "narratorDefault">>,
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
  onDirectorUpdate,
  onNarratorDefaultUpdate,
}: {
  configuration: GlobalVoiceConfiguration;
  onDirectorUpdate: (value: DirectorVoiceSelection) => void;
  onNarratorDefaultUpdate: (value: NarratorVoiceDefault) => void;
}) {
  const [directorDraft, setDirectorDraft] = useState(() =>
    voiceSelectionValue(configuration.director),
  );
  const [narratorDraft, setNarratorDraft] = useState(() =>
    voiceSelectionValue(configuration.narratorDefault),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"director" | "narrator" | null>(null);

  useEffect(() => {
    setDirectorDraft(voiceSelectionValue(configuration.director));
    setError(null);
  }, [configuration.director]);

  useEffect(() => {
    setNarratorDraft(voiceSelectionValue(configuration.narratorDefault));
    setError(null);
  }, [configuration.narratorDefault]);

  const directorDirty = directorDraft !== voiceSelectionValue(configuration.director);
  const narratorDirty = narratorDraft !== voiceSelectionValue(configuration.narratorDefault);

  const saveDirector = () => {
    const update = window.setta.speech.updateDirectorVoiceSelection;
    if (!update || saving) {
      return;
    }
    setSaving("director");
    setError(null);
    void update(voiceSelectionRequest(directorDraft)).then(
      (value) => {
        onDirectorUpdate(value);
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
          <h2 className="text-xs font-semibold tracking-wide text-foreground">Voices</h2>
          <p className="text-[11px] text-muted-foreground">
            Choose distinct voices for the Director and workstream narrators.
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
          description={`Currently resolves to ${configuration.director.resolvedVoiceId ?? "no voice"}.`}
          disabled={saving !== null}
          label="Director voice"
          onChange={setDirectorDraft}
          onReset={() => setDirectorDraft(voiceSelectionValue(configuration.director))}
          onSave={saveDirector}
          saving={saving === "director"}
          selection={directorDraft}
          dirty={directorDirty}
          voices={configuration.capabilities.voiceCatalog.voiceIds}
        />
        <VoiceConfigurationCard
          description="Used for new workstreams; automatic mode chooses a distinct voice for each."
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

function voiceSelectionValue(
  value: Pick<DirectorVoiceSelection | NarratorVoiceDefault, "selection" | "requestedVoiceId">,
): string {
  return value.selection === "auto_distinct"
    ? automaticSelectionValue
    : requireSelectionID(value.requestedVoiceId, "exact voice");
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
  return error instanceof Error ? error.message : "Unable to save voice settings. Try again.";
}
