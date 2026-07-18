import type { SpeechProvider } from "@generated/backend";
import type { SpeechCredentialOperation, SpeechCredentialSettings } from "@shared/speech-ipc";
import { ExternalLink, KeyRound, Loader2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const openAIApiKeysURL = "https://platform.openai.com/api-keys";

export function OpenAIVoiceConnectionCard() {
  const [settings, setSettings] = useState<SpeechCredentialSettings>({ status: "loading" });
  const [mode, setMode] = useState<"add" | "replace" | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [operation, setOperation] = useState<SpeechCredentialOperation | null>(null);
  const speechAPI = rendererSpeechAPI();
  const canSave = Boolean(speechAPI?.saveCredential);
  const canRemove = Boolean(speechAPI?.removeCredential);
  const canManage = canSave && canRemove;

  const readSettings = () => {
    const readCredentialSettings = rendererSpeechAPI()?.readCredentialSettings;
    if (!readCredentialSettings) {
      setSettings({
        message: "Secure storage for speech credentials is available only in Setta Desktop.",
        status: "secure_storage_unavailable",
      });
      return;
    }
    setOperation("read");
    void readCredentialSettings().then(
      (next) => {
        setSettings(next);
        setOperation(null);
      },
      (reason: unknown) => {
        setSettings(failedCredentialSettings("read", reason));
        setOperation(null);
      },
    );
  };

  useEffect(() => {
    readSettings();
    return rendererSpeechAPI()?.onCredentialSettingsChanged?.((next) => {
      setSettings(next);
      if (next.status === "configured" || next.status === "not_configured") {
        setApiKeyDraft("");
        setMode(null);
      }
    });
  }, []);

  useEffect(() => {
    if (settings.status === "configured" || settings.status === "not_configured") {
      setApiKeyDraft("");
      setMode(null);
    }
  }, [settings.status]);

  const save = () => {
    const apiKey = apiKeyDraft.trim();
    const saveCredential = rendererSpeechAPI()?.saveCredential;
    if (!saveCredential || operation || apiKey.length === 0) {
      return;
    }
    setOperation("save");
    void saveCredential({ apiKey }).then(
      (next) => {
        setSettings(next);
        if (next.status === "configured") {
          setApiKeyDraft("");
          setMode(null);
        }
        setOperation(null);
      },
      (reason: unknown) => {
        setSettings(failedCredentialSettings("save", reason));
        setOperation(null);
      },
    );
  };

  const remove = () => {
    const removeCredential = rendererSpeechAPI()?.removeCredential;
    if (!removeCredential || operation) {
      return;
    }
    setOperation("remove");
    void removeCredential().then(
      (next) => {
        setApiKeyDraft("");
        setMode(null);
        setSettings(next);
        setOperation(null);
      },
      (reason: unknown) => {
        setApiKeyDraft("");
        setSettings(failedCredentialSettings("remove", reason));
        setOperation(null);
      },
    );
  };

  return (
    <OpenAIVoiceConnectionCardView
      apiKeyDraft={apiKeyDraft}
      canManage={canManage}
      mode={mode}
      onApiKeyDraftChange={setApiKeyDraft}
      onCancelReplace={() => {
        setApiKeyDraft("");
        setMode(null);
      }}
      onDisconnect={remove}
      onOpenApiKeys={() => void rendererOpenExternalURL(openAIApiKeysURL)}
      onReplace={() => setMode("replace")}
      onRetry={readSettings}
      onSave={save}
      operation={operation}
      settings={settings}
    />
  );
}

interface OpenAIVoiceConnectionCardViewProps {
  apiKeyDraft: string;
  canManage: boolean;
  mode: "add" | "replace" | null;
  onApiKeyDraftChange: (value: string) => void;
  onCancelReplace: () => void;
  onDisconnect: () => void;
  onOpenApiKeys: () => void;
  onReplace: () => void;
  onRetry: () => void;
  onSave: () => void;
  operation: SpeechCredentialOperation | null;
  settings: SpeechCredentialSettings;
}

export function OpenAIVoiceConnectionCardView({
  apiKeyDraft,
  canManage,
  mode,
  onApiKeyDraftChange,
  onCancelReplace,
  onDisconnect,
  onOpenApiKeys,
  onReplace,
  onRetry,
  onSave,
  operation,
  settings,
}: OpenAIVoiceConnectionCardViewProps) {
  const status = speechCredentialStatusPresentation(settings);
  const busy = operation !== null;
  const inputVisible = credentialInputVisible({ canManage, mode, settings });
  return (
    <article
      className="grid gap-3 rounded-sm border border-border bg-card/40 p-3"
      data-testid="openai-voice-connection-card"
    >
      <header className="flex min-h-8 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">
              OpenAI voice connection
            </h2>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Applies to Local only. OpenAI bills API usage separately from ChatGPT.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-medium",
            credentialStatusClass(status.tone),
          )}
          data-testid="openai-voice-connection-status"
        >
          {status.label}
        </span>
      </header>
      <div className="grid gap-1">
        <p className="text-xs text-foreground">{status.summary}</p>
        {status.detail ? (
          <p className="text-[11px] leading-4 text-muted-foreground">{status.detail}</p>
        ) : null}
        {!canManage && settings.status !== "secure_storage_unavailable" ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            Credential management is available in Setta Desktop.
          </p>
        ) : null}
      </div>
      {inputVisible ? (
        <CredentialPasswordInput
          apiKeyDraft={apiKeyDraft}
          disabled={busy}
          onApiKeyDraftChange={onApiKeyDraftChange}
        />
      ) : null}
      <CredentialCardActions
        apiKeyDraft={apiKeyDraft}
        busy={busy}
        canManage={canManage}
        inputVisible={inputVisible}
        mode={mode}
        onCancelReplace={onCancelReplace}
        onDisconnect={onDisconnect}
        onOpenApiKeys={onOpenApiKeys}
        onReplace={onReplace}
        onRetry={onRetry}
        onSave={onSave}
        operation={operation}
        settings={settings}
      />
    </article>
  );
}

function CredentialPasswordInput({
  apiKeyDraft,
  disabled,
  onApiKeyDraftChange,
}: {
  apiKeyDraft: string;
  disabled: boolean;
  onApiKeyDraftChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      OpenAI API key
      <Input
        aria-label="OpenAI API key"
        autoCapitalize="none"
        autoComplete="off"
        disabled={disabled}
        onChange={(event) => onApiKeyDraftChange(event.currentTarget.value)}
        spellCheck={false}
        type="password"
        value={apiKeyDraft}
      />
    </label>
  );
}

function CredentialCardActions({
  apiKeyDraft,
  busy,
  canManage,
  inputVisible,
  mode,
  onCancelReplace,
  onDisconnect,
  onOpenApiKeys,
  onReplace,
  onRetry,
  onSave,
  operation,
  settings,
}: {
  apiKeyDraft: string;
  busy: boolean;
  canManage: boolean;
  inputVisible: boolean;
  mode: "add" | "replace" | null;
  onCancelReplace: () => void;
  onDisconnect: () => void;
  onOpenApiKeys: () => void;
  onReplace: () => void;
  onRetry: () => void;
  onSave: () => void;
  operation: SpeechCredentialOperation | null;
  settings: SpeechCredentialSettings;
}) {
  const connectedActionsVisible = settings.status === "configured" && mode === null && canManage;
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <Button disabled={busy} onClick={onOpenApiKeys} type="button">
        <ExternalLink className="h-3.5 w-3.5" />
        OpenAI API keys
      </Button>
      <div className="flex flex-wrap justify-end gap-1">
        <CredentialRetryAction busy={busy} onRetry={onRetry} settings={settings} />
        {connectedActionsVisible ? (
          <ConnectedCredentialActions
            busy={busy}
            onDisconnect={onDisconnect}
            onReplace={onReplace}
          />
        ) : null}
        {inputVisible ? (
          <CredentialSaveActions
            apiKeyDraft={apiKeyDraft}
            busy={busy}
            mode={mode}
            onCancelReplace={onCancelReplace}
            onSave={onSave}
            operation={operation}
            settings={settings}
          />
        ) : null}
      </div>
    </div>
  );
}

function CredentialRetryAction({
  busy,
  onRetry,
  settings,
}: {
  busy: boolean;
  onRetry: () => void;
  settings: SpeechCredentialSettings;
}) {
  if (!credentialRetryVisible(settings)) {
    return null;
  }
  return (
    <Button disabled={busy} onClick={onRetry} type="button">
      <RefreshCw className="h-3.5 w-3.5" />
      Retry
    </Button>
  );
}

function ConnectedCredentialActions({
  busy,
  onDisconnect,
  onReplace,
}: {
  busy: boolean;
  onDisconnect: () => void;
  onReplace: () => void;
}) {
  return (
    <>
      <Button disabled={busy} onClick={onReplace} type="button">
        <KeyRound className="h-3.5 w-3.5" />
        Replace
      </Button>
      <Button disabled={busy} onClick={onDisconnect} type="button">
        <Unplug className="h-3.5 w-3.5" />
        Disconnect
      </Button>
    </>
  );
}

function CredentialSaveActions({
  apiKeyDraft,
  busy,
  mode,
  onCancelReplace,
  onSave,
  operation,
  settings,
}: {
  apiKeyDraft: string;
  busy: boolean;
  mode: "add" | "replace" | null;
  onCancelReplace: () => void;
  onSave: () => void;
  operation: SpeechCredentialOperation | null;
  settings: SpeechCredentialSettings;
}) {
  const cancelVisible = settings.status === "configured" || mode === "replace";
  return (
    <>
      {cancelVisible ? (
        <Button disabled={busy} onClick={onCancelReplace} type="button">
          Cancel
        </Button>
      ) : null}
      <Button
        disabled={credentialSaveDisabled({ apiKeyDraft, busy })}
        onClick={onSave}
        type="button"
        variant="primary"
      >
        {operation === "save" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        Save and verify
      </Button>
    </>
  );
}

function rendererSpeechAPI(): (typeof window.setta)["speech"] | null {
  if (typeof window === "undefined" || !window.setta) {
    return null;
  }
  return window.setta.speech;
}

function rendererOpenExternalURL(url: string): Promise<void> {
  if (typeof window === "undefined" || !window.setta) {
    return Promise.resolve();
  }
  return window.setta.app.openExternalUrl(url);
}

function failedCredentialSettings(
  operation: SpeechCredentialOperation,
  reason: unknown,
): SpeechCredentialSettings {
  return {
    message: reason instanceof Error ? reason.message : "OpenAI voice credential operation failed.",
    operation,
    status: "failed",
  };
}

function credentialInputVisible({
  canManage,
  mode,
  settings,
}: {
  canManage: boolean;
  mode: "add" | "replace" | null;
  settings: SpeechCredentialSettings;
}): boolean {
  if (!canManage) {
    return false;
  }
  if (settings.status === "not_configured" || mode !== null) {
    return true;
  }
  return settings.status === "failed" && settings.operation === "save";
}

function credentialRetryVisible(settings: SpeechCredentialSettings): boolean {
  return settings.status === "failed" && settings.operation !== "save";
}

function credentialSaveDisabled({
  apiKeyDraft,
  busy,
}: {
  apiKeyDraft: string;
  busy: boolean;
}): boolean {
  return busy || apiKeyDraft.trim().length === 0;
}

function speechCredentialStatusPresentation(settings: SpeechCredentialSettings): {
  detail: string | null;
  label: string;
  summary: string;
  tone: "good" | "muted" | "pending" | "problem";
} {
  switch (settings.status) {
    case "loading":
      return {
        detail: null,
        label: "Checking",
        summary: "Reading the local voice credential state.",
        tone: "pending",
      };
    case "not_configured":
      return {
        detail: "The saved value is never shown after it is stored.",
        label: "Not connected",
        summary: `Add an OpenAI API key to connect ${providerLabel(settings.provider)} voice locally.`,
        tone: "muted",
      };
    case "configured":
      return {
        detail:
          "The credential is stored with this desktop installation and is not sent to remote runtimes.",
        label: "Connected",
        summary: `${providerLabel(settings.provider)} voice is connected for the local runtime.`,
        tone: "good",
      };
    case "secure_storage_unavailable":
      return {
        detail: settings.message,
        label: "Storage unavailable",
        summary: "This system cannot protect a local OpenAI voice credential.",
        tone: "problem",
      };
    case "corrupt":
      return {
        detail: settings.message,
        label: "Needs attention",
        summary: "The stored voice credential cannot be read.",
        tone: "problem",
      };
    case "failed":
      return {
        detail: settings.message,
        label: operationFailureLabel(settings.operation),
        summary: "The OpenAI voice connection did not change.",
        tone: "problem",
      };
    default:
      return assertNever(settings);
  }
}

function providerLabel(provider: SpeechProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    default:
      return assertNever(provider);
  }
}

function operationFailureLabel(operation: SpeechCredentialOperation): string {
  switch (operation) {
    case "read":
      return "Read failed";
    case "remove":
      return "Disconnect failed";
    case "restore":
      return "Restore failed";
    case "save":
      return "Save failed";
    default:
      return assertNever(operation);
  }
}

function credentialStatusClass(tone: "good" | "muted" | "pending" | "problem"): string {
  switch (tone) {
    case "good":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "muted":
      return "border-border bg-muted text-muted-foreground";
    case "pending":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "problem":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    default:
      return assertNever(tone);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
