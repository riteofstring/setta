import type {
  AppearanceAccentPalette,
  AppearanceColorScheme,
  AppearancePreset,
  AppearanceSettings,
  AppearanceShadcnPalette,
  AppearanceStatusPalette,
  AppearanceTailwindPalette,
  AppearanceWorkspacePalette,
  ConversationPresentationProfile,
  MasterVoiceSelection,
  NarratorVoiceDefault,
  Role,
  RoleConfiguration,
  RoleProfile,
  SpeechCapabilities,
} from "@generated/backend";
import type {
  LocalMacOSVoiceHealth,
  LocalMacOSVoiceModelDownloadStatus,
  SpeechCredentialSettings,
  SpeechProviderSelectionSettings,
} from "@shared/speech-ipc";
import type { RuntimeConnectionStatus, RuntimeRegistrySnapshot } from "@shared/types";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { appearanceStyleVariables, updateAppearanceColor } from "../stores/appearance-store";
import {
  completeSettingsNavigationRequest,
  requestOpenAIVoiceConnectionSettings,
  requestVoiceProviderSelectionSettings,
  useSettingsNavigationStore,
} from "../stores/settings-navigation-store";
import { DeveloperSettingsEditor } from "./developer-settings";
import {
  OpenAIVoiceConnectionCardView,
  speechCredentialSaveRequestFromDraft,
} from "./openai-voice-connection-card";
import { LocalMacOSAlwaysListeningCardView } from "./local-macos-always-listening-card";
import {
  ConversationPresentationConfiguration,
  connectedRuntimeConfigurationKey,
  GlobalVoiceConfigurationForm,
} from "./presentation-configuration-settings";
import { RoleConfigurationForm, RoleConfigurationSettings } from "./role-configuration-settings";
import { openAIVoiceConnectionSettings } from "./settings-navigation";
import { AppearanceSettingsEditor, SettingsPanel } from "./settings-panel";
import { SpeechProviderSelectionCardView } from "./speech-provider-selection-card";

describe("appearance settings", () => {
  test("renders theme as the default settings subtab", () => {
    const html = renderToString(<SettingsPanel />);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Theme");
    expect(html).toContain("AI Roles");
    expect(html).toContain("Voices");
    expect(html).toContain("Shortcuts");
    expect(html).toContain("Developer");
    expect(html).toContain("Codex Account");
    expect(html).toContain("bg-transparent");
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Loading theme settings");
    expect(html).not.toContain("Chat Defaults");
    expect(html).not.toContain("Terminal Profiles");
    expect(html).not.toContain('data-testid="codex-account-settings"');
  });

  test("renders backend-owned per-conversation presentation controls", () => {
    const profile: ConversationPresentationProfile = {
      conversationId: "conversation-presentation",
      narratorSpeechEnabled: true,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "exact",
      requestedNarratorVoiceId: null,
      requestedPaletteId: "blue",
      resolvedNarratorVoiceId: "alloy",
      resolvedPaletteId: "blue",
      updatedAt: "2026-07-14T12:00:00Z",
    };

    const html = renderToString(
      <ConversationPresentationConfiguration
        archived={false}
        profile={profile}
        workspaceId="workspace-presentation"
      />,
    );

    expect(html).toContain('data-testid="conversation-presentation-configuration"');
    expect(html).toContain('aria-label="Conversation color selection"');
    expect(html).toContain('aria-label="Conversation narrator voice selection"');
    expect(html).toContain('aria-label="Speak narrator updates"');
    expect(html).toContain('value="auto_distinct"');
    expect(html).toContain('value="blue" selected=""');
    expect(html).toContain("Sky");
    expect(html).toContain("Teal");
  });

  test("keeps voice catalog selectors enabled while OpenAI voice is disconnected", () => {
    const html = renderToString(
      <GlobalVoiceConfigurationForm
        configuration={{
          capabilities: sampleSpeechCapabilities("not_configured"),
          master: sampleMasterVoiceSelection(),
          narratorDefault: sampleNarratorVoiceDefault(),
        }}
        onMasterUpdate={vi.fn()}
        onNarratorDefaultUpdate={vi.fn()}
      />,
    );
    const normalizedHtml = html.replaceAll("<!-- -->", "");

    expect(normalizedHtml).toContain("Voice catalog · 3 voices");
    expect(html).toContain("Marin");
    expect(html).toContain("Cedar");
    expect(selectTagDisabled(html, "Master voice selection")).toBe(false);
    expect(selectTagDisabled(html, "Default narrator voice selection")).toBe(false);
    expect(html).not.toContain("OPENAI_API_KEY");
  });

  test("renders the OpenAI voice connection setup card", () => {
    const html = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          provider: "openai",
          status: "not_configured",
        })}
        apiKeyDraft=""
        canManage
        mode={null}
      />,
    );

    expect(html).toContain('data-testid="openai-voice-connection-card"');
    expect(html).toContain("OpenAI voice connection");
    expect(html).toContain("Not connected");
    expect(html).toContain("Optional cloud voice provider");
    expect(html).toContain("OpenAI API key");
    expect(html).toContain('type="password"');
    expect(html).toContain("Save and verify");
    expect(html).toContain("OpenAI API keys");
    expect(html).not.toContain("OPENAI_API_KEY");
  });

  test("renders local macOS as the default voice provider with OpenAI as an option", () => {
    const html = renderToString(
      <SpeechProviderSelectionCardView
        error={null}
        localHealth={localVoiceHealth("ready")}
        onRefresh={vi.fn()}
        onSelectProvider={vi.fn()}
        selection={providerSelection("local_macos")}
        updatingProvider={null}
      />,
    );

    expect(html).toContain('data-testid="speech-provider-selection-card"');
    expect(html).toContain("Voice provider");
    expect(html).toContain("Local macOS is the default");
    expect(html).toContain("Local macOS");
    expect(html).toContain("Default");
    expect(html).toContain("Selected");
    expect(html).toContain("OpenAI");
    expect(html).toContain("Use OpenAI");
  });

  test("renders a verified local model download action while the model is missing", () => {
    const html = renderToString(
      <SpeechProviderSelectionCardView
        error={null}
        localHealth={localVoiceHealth("missing_model")}
        localModelDownload={localModelDownloadStatus("idle")}
        onDownloadLocalModel={vi.fn()}
        onRefresh={vi.fn()}
        onSelectProvider={vi.fn()}
        selection={providerSelection("local_macos")}
        updatingProvider={null}
      />,
    );

    expect(html).toContain("Missing model");
    expect(html).toContain("Download model");
    expect(html).toContain("Download the base.en voice model (141 MB)");
  });

  test("renders local model download progress without changing provider selection", () => {
    const html = renderToString(
      <SpeechProviderSelectionCardView
        error={null}
        localHealth={localVoiceHealth("missing_model")}
        localModelDownload={localModelDownloadStatus("downloading")}
        onDownloadLocalModel={vi.fn()}
        onRefresh={vi.fn()}
        onSelectProvider={vi.fn()}
        selection={providerSelection("local_macos")}
        updatingProvider={null}
      />,
    );
    const normalizedHtml = html.replaceAll("<!-- -->", "");

    expect(normalizedHtml).toContain("Downloading");
    expect(normalizedHtml).toContain("16%");
    expect(normalizedHtml).toContain("Downloading base.en voice model (24 MB of 141 MB).");
    expect(normalizedHtml).toContain("Selected");
  });

  test("renders always listening readiness and active states", () => {
    const unavailable = renderToString(
      <LocalMacOSAlwaysListeningCardView
        error={null}
        onDownloadLocalModel={vi.fn()}
        onToggle={vi.fn()}
        settings={{
          availability: {
            message:
              "Always listening needs a packaged Hey Setta wake model before it can be enabled.",
            setupAction: null,
            status: "unavailable",
          },
          enabled: false,
          state: { status: "disabled" },
        }}
        updating={false}
      />,
    );
    const active = renderToString(
      <LocalMacOSAlwaysListeningCardView
        error={null}
        onDownloadLocalModel={vi.fn()}
        onToggle={vi.fn()}
        settings={{
          availability: { status: "ready" },
          enabled: true,
          state: {
            captureStartedAtMs: 1_140,
            score: 0.74,
            status: "capturing",
            wakeDetectedAtMs: 960,
          },
        }}
        updating={false}
      />,
    );

    expect(unavailable).toContain('data-testid="local-macos-always-listening-card"');
    expect(unavailable).toContain("Always listening");
    expect(unavailable).toContain("Unavailable");
    expect(unavailable).toContain("packaged Hey Setta wake model");
    expect(unavailable).toContain('disabled=""');
    expect(active).toContain("Recording");
    expect(active).toContain('checked=""');
  });

  test("keeps a current provider selectable after provider selection storage fails", () => {
    const html = renderToString(
      <SpeechProviderSelectionCardView
        canUpdateProvider
        error={'Speech provider "local_macos" is not supported on linux.'}
        fallbackSupportedProviders={["openai"]}
        localHealth={null}
        onRefresh={vi.fn()}
        onSelectProvider={vi.fn()}
        selection={null}
        updatingProvider={null}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Use OpenAI");
    expect(html).not.toContain("Use Local macOS");
    expect(html).not.toContain('disabled=""');
  });

  test("preserves leading and trailing whitespace in the credential save request", () => {
    const draft = " renderer-whitespace-candidate ";

    expect(speechCredentialSaveRequestFromDraft(draft)).toEqual({
      provider: "openai",
      apiKey: draft,
    });
    expect(speechCredentialSaveRequestFromDraft(" \n\t ")).toBeNull();
  });

  test("keeps the password draft after a save validation failure", () => {
    const draft = " renderer-leading-trailing-candidate ";
    const html = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          message: "OpenAI API key must not contain leading or trailing whitespace.",
          operation: "save",
          status: "failed",
        })}
        apiKeyDraft={draft}
        canManage
      />,
    );

    expect(html).toContain('type="password"');
    expect(html).toContain(`value="${draft}"`);
    expect(html).toContain("Save failed");
  });

  test("records and completes typed navigation to the OpenAI voice connection card", () => {
    useSettingsNavigationStore.setState(useSettingsNavigationStore.getInitialState(), true);

    requestOpenAIVoiceConnectionSettings();
    const request = useSettingsNavigationStore.getState().request;

    expect(request).toEqual({
      focusTarget: "openai_voice_connection",
      requestId: 1,
      subtab: "speech",
    });
    expect(useSettingsNavigationStore.getState().route).toEqual({
      focusTarget: "openai_voice_connection",
      page: "settings",
      requestId: 1,
      subtab: "speech",
    });

    completeSettingsNavigationRequest(request?.requestId ?? 0);

    expect(useSettingsNavigationStore.getState().request).toBeNull();
    expect(useSettingsNavigationStore.getState().route).toEqual({
      focusTarget: null,
      page: "settings",
      requestId: 1,
      subtab: "speech",
    });

    requestOpenAIVoiceConnectionSettings();

    expect(useSettingsNavigationStore.getState().request?.requestId).toBe(2);
  });

  test("clears pending typed navigation when closing Settings", () => {
    useSettingsNavigationStore.setState(useSettingsNavigationStore.getInitialState(), true);

    requestOpenAIVoiceConnectionSettings();
    useSettingsNavigationStore.getState().closeSettings();

    expect(useSettingsNavigationStore.getState().request).toBeNull();
    expect(useSettingsNavigationStore.getState().route).toEqual({ page: "workspace" });
  });

  test("opens the Settings page when routing to OpenAI voice setup", () => {
    useSettingsNavigationStore.setState(useSettingsNavigationStore.getInitialState(), true);

    openAIVoiceConnectionSettings();

    expect(useSettingsNavigationStore.getState().request).toEqual({
      focusTarget: "openai_voice_connection",
      requestId: 1,
      subtab: "speech",
    });
    expect(useSettingsNavigationStore.getState().route).toEqual({
      focusTarget: "openai_voice_connection",
      page: "settings",
      requestId: 1,
      subtab: "speech",
    });
  });

  test("opens the Settings page when routing to voice provider setup", () => {
    useSettingsNavigationStore.setState(useSettingsNavigationStore.getInitialState(), true);

    requestVoiceProviderSelectionSettings();

    expect(useSettingsNavigationStore.getState().request).toEqual({
      focusTarget: "voice_provider_selection",
      requestId: 1,
      subtab: "speech",
    });
    expect(useSettingsNavigationStore.getState().route).toEqual({
      focusTarget: "voice_provider_selection",
      page: "settings",
      requestId: 1,
      subtab: "speech",
    });
  });

  test("renders a connected OpenAI voice card without a saved value", () => {
    const html = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          provider: "openai",
          status: "configured",
        })}
        apiKeyDraft="candidate-value-that-must-not-render"
        canManage
        mode={null}
      />,
    );

    expect(html).toContain("Connected");
    expect(html).toContain("Replace");
    expect(html).toContain("Disconnect");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("candidate-value-that-must-not-render");
  });

  test("distinguishes the local credential from active remote runtime voice status", () => {
    const html = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          provider: "openai",
          status: "configured",
        })}
        activeRuntimeVoiceStatus={{
          displayName: "Remote lab",
          message: null,
          providerStatus: "not_configured",
        }}
        canManage
      />,
    );

    expect(html).toContain("Optional cloud voice provider");
    expect(html).toContain("Active runtime voice status");
    expect(html).toContain("Remote lab reports voice not connected.");
    expect(html).toContain("Configure voice on that runtime.");
    expect(html).toContain("The Local credential on this card is not sent there.");
    expect(html).not.toContain("OPENAI_API_KEY");
  });

  test("shows active remote runtime voice status as checking while switching", () => {
    const html = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          provider: "openai",
          status: "configured",
        })}
        activeRuntimeVoiceStatus={{
          displayName: "Remote lab",
          message: null,
          providerStatus: "loading",
        }}
        canManage
      />,
    );

    expect(html).toContain("Checking voice status for Remote lab.");
    expect(html).toContain("The Local credential on this card is not sent to remote runtimes.");
  });

  test("loads voice configuration only for a connected active runtime snapshot", () => {
    expect(
      connectedRuntimeConfigurationKey(runtimeSnapshot({ connectionStatus: "connecting" })),
    ).toBeNull();
    expect(
      connectedRuntimeConfigurationKey(runtimeSnapshot({ connectionStatus: "unreachable" })),
    ).toBeNull();
    expect(
      connectedRuntimeConfigurationKey(runtimeSnapshot({ connectionStatus: "connected" })),
    ).toBe("remote-runtime:63:2026-07-18T12:00:00.000Z");
  });

  test("renders replacement mode with an empty password control", () => {
    const html = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          provider: "openai",
          status: "configured",
        })}
        apiKeyDraft=""
        canManage
        mode="replace"
      />,
    );

    expect(html).toContain("Connected");
    expect(html).toContain("OpenAI API key");
    expect(html).toContain("Cancel");
    expect(html).toContain("Save and verify");
  });

  test("renders secure-storage and corrupt credential failures without an entry field", () => {
    const secureStorage = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          message: "Electron safeStorage encryption is unavailable.",
          status: "secure_storage_unavailable",
        })}
        canManage
      />,
    );
    const corrupt = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          message: "Stored credential ciphertext could not be decrypted.",
          reason: "decrypt_failed",
          status: "corrupt",
        })}
        canManage
      />,
    );

    expect(secureStorage).toContain("Storage unavailable");
    expect(secureStorage).toContain("Electron safeStorage encryption is unavailable.");
    expect(secureStorage).not.toContain('type="password"');
    expect(corrupt).toContain("Needs attention");
    expect(corrupt).toContain("Stored credential ciphertext could not be decrypted.");
    expect(corrupt).toContain("Disconnect");
    expect(corrupt).not.toContain('type="password"');
    expect(corrupt).not.toContain("Replace");
    expect(corrupt).not.toContain("Save and verify");
  });

  test("renders retry and failed-save credential presentations", () => {
    const failedRead = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          message: "Local speech runtime is not connected.",
          operation: "read",
          status: "failed",
        })}
        canManage
      />,
    );
    const failedSave = renderToString(
      <OpenAIVoiceConnectionCardView
        {...credentialCardProps({
          message: "OpenAI voice credential could not be verified.",
          operation: "save",
          status: "failed",
        })}
        canManage
      />,
    );

    expect(failedRead).toContain("Read failed");
    expect(failedRead).toContain("Retry");
    expect(failedRead).not.toContain('type="password"');
    expect(failedSave).toContain("Save failed");
    expect(failedSave).toContain("OpenAI API key");
    expect(failedSave).toContain("Save and verify");
  });

  test("renders independent model and reasoning controls for every AI role", () => {
    const html = renderToString(
      <RoleConfigurationForm
        configuration={sampleRoleConfiguration()}
        onSave={async () => sampleRoleConfiguration()}
      />,
    );
    const normalizedHtml = html.replaceAll("<!-- -->", "");

    expect(html).toContain('data-testid="role-configuration-settings"');
    expect(html).toContain("Primary workspace agent for durable topic work.");
    expect(html).toContain("Lightweight projection, status, and local routing role.");
    expect(html).toContain("Restricted global topic discovery and routing role.");
    expect(html).toContain("Read-only focused follow-up and side-conversation role.");
    expect(html).toContain('aria-label="Agent model"');
    expect(html).toContain('aria-label="Narrator model"');
    expect(html).toContain('aria-label="Master model"');
    expect(html).toContain('aria-label="Side agent model"');
    expect(normalizedHtml).toContain("Provider catalog validated · 4 models");
    expect(html).toContain("gpt-5.6-sol");
    expect(html).toContain("gpt-5.4-mini");
  });

  test("offers global and selected-workspace role configuration scopes", () => {
    const html = renderToString(<RoleConfigurationSettings />);

    expect(html).toContain('data-testid="role-configuration-scope-settings"');
    expect(html).toContain('aria-label="AI role configuration scope"');
    expect(html).toContain("Global defaults");
    expect(html).toContain("Selected workspace");
  });

  test("renders workspace overrides without the global-only master role", () => {
    const configuration = sampleRoleConfiguration();
    const workspaceId = "workspace-role-settings";
    configuration.scope = {
      conversationId: null,
      kind: "workspace",
      workspaceId,
    };
    configuration.profiles = configuration.profiles
      .filter((profile) => profile.role !== "master")
      .map((profile) => ({ ...profile, effectiveSource: "global" as const }));
    const html = renderToString(
      <RoleConfigurationForm configuration={configuration} onSave={async () => configuration} />,
    );
    const normalizedHtml = html.replaceAll("<!-- -->", "");

    expect(html).toContain('data-role-configuration-scope="workspace"');
    expect(html).toContain("Inherited from global");
    expect(normalizedHtml).toContain("Use inherited agent");
    expect(html).not.toContain('aria-label="Master model"');
  });

  test("renders the developer performance stats toggle", () => {
    const html = renderToString(
      <DeveloperSettingsEditor
        developer={{
          allowResizedPanesToOverflowViewport: false,
          overviewCardMaxWidthPx: 460,
          overviewCardMinWidthPx: 280,
          showPerformanceStats: false,
        }}
        dirty={false}
        error={null}
        onClampResizedPanesToViewportChange={vi.fn()}
        onOverviewCardWidthBoundsChange={vi.fn()}
        onRevert={vi.fn()}
        onSave={async () => {}}
        onShowPerformanceStatsChange={vi.fn()}
        status="ready"
      />,
    );

    expect(html).toContain('data-testid="developer-settings"');
    expect(html).toContain("Clamp resized panes to viewport");
    expect(html).toContain("Top bar performance stats");
    expect(html).toContain("Overview card min width");
    expect(html).toContain("Overview card max width");
    expect(html).toContain('value="280"');
    expect(html).toContain('value="460"');
    expect(html).toContain('type="checkbox"');
  });

  test("maps active appearance settings to Tailwind and shadcn CSS variables", () => {
    const settings = sampleAppearanceSettings();
    const variables = appearanceStyleVariables(settings);

    expect(variables["--color-setta-900"]).toBe(settings.dark.tailwind.setta900);
    expect(variables["--setta-900"]).toBe(settings.dark.tailwind.setta900);
    expect(variables["--setta-logo"]).toBe("oklch(0.8460 0.1292 213.38)");
    expect(variables["--background"]).toBe(settings.dark.shadcn.background);
    expect(variables["--status-warning"]).toBe(settings.dark.status.warning);
    expect(variables["--color-status-warning"]).toBe(settings.dark.status.warning);
    expect(variables["--workspace-surface"]).toBe(settings.dark.workspace.surface);
    expect(variables["--color-workspace-pane-selected-outline"]).toBe(
      settings.dark.workspace.paneSelectedOutline,
    );
    expect(variables["--font-sans"]).toBe(settings.fonts.sans);
  });

  test("uses the light color scheme when light mode is active", () => {
    const settings = sampleAppearanceSettings();
    const lightSetta900 = color(333);
    const lightWarning = color(334);
    const lightSettings: AppearanceSettings = {
      ...settings,
      light: {
        ...settings.light,
        status: { ...settings.light.status, warning: lightWarning },
        tailwind: { ...settings.light.tailwind, setta900: lightSetta900 },
      },
      mode: "light",
    };

    const variables = appearanceStyleVariables(lightSettings);

    expect(variables["--background"]).toBe(lightSettings.light.shadcn.background);
    expect(variables["--color-setta-900"]).toBe(lightSetta900);
    expect(variables["--setta-logo"]).toBe("oklch(0.5800 0.1300 213.38)");
    expect(variables["--status-warning"]).toBe(lightWarning);
  });

  test("updates a nested color without changing the source settings", () => {
    const settings = sampleAppearanceSettings();
    const nextWarning = color(88);
    const updated = updateAppearanceColor(settings, "light", "status", "warning", nextWarning);

    expect(updated.light.status.warning).toBe(nextWarning);
    expect(settings.light.status.warning).not.toBe(nextWarning);
    expect(updated.dark.status.warning).toBe(settings.dark.status.warning);
  });

  test("renders editable mode, font, Tailwind, shadcn, and status fields", () => {
    const html = renderToString(
      <AppearanceSettingsEditor
        defaultPresetId="setta_standard"
        dirty
        error={null}
        onApplySettings={vi.fn()}
        onColorChange={vi.fn()}
        onFontChange={vi.fn()}
        onModeChange={vi.fn()}
        onRevert={vi.fn()}
        onSave={async () => {}}
        presets={sampleAppearancePresets()}
        settings={sampleAppearanceSettings()}
        status="ready"
      />,
    );
    const normalizedHtml = html.replaceAll("<!-- -->", "");

    expect(normalizedHtml).toContain("Color Presets");
    expect(normalizedHtml).toContain("Color preset");
    expect(normalizedHtml).toContain("3 options");
    expect(normalizedHtml).toContain("Setta Standard");
    expect(html).toContain("Custom Seed Palette");
    expect(html).toContain("Custom OKLCH seed color");
    expect(html).toContain("oklch(0.8460 0.1292 213.38)");
    expect(html).toContain("Color scheme");
    expect(html).toContain("Light");
    expect(html).toContain("Dark");
    expect(html).toContain("Fonts");
    expect(html).toContain("Advanced Color Tokens");
    expect(html).toContain("Niri Workspace");
    expect(html).toContain("Palette Scale");
    expect(html).toContain("shadcn/ui Tokens");
    expect(html).toContain("Status Colors");
    expect(html).toContain("Setta color");
    expect(html).toContain("OKLCH picker");
    expect(html).toContain("Lightness");
    expect(html).toContain("Chroma");
    expect(html).toContain("Hue");
    expect(html).toContain("Pane selected outline");
    expect(html).toContain("Dot grid");
    expect(html).toContain("Setta 900");
    expect(html).toContain("Card foreground");
    expect(html).toContain("Warning foreground");
  });
});

function credentialCardProps(
  settings: SpeechCredentialSettings,
): Parameters<typeof OpenAIVoiceConnectionCardView>[0] {
  return {
    apiKeyDraft: "",
    canManage: false,
    mode: null,
    onApiKeyDraftChange: vi.fn(),
    onCancelReplace: vi.fn(),
    onDisconnect: vi.fn(),
    onOpenApiKeys: vi.fn(),
    onReplace: vi.fn(),
    onRetry: vi.fn(),
    onSave: vi.fn(),
    operation: null,
    settings,
  };
}

function sampleSpeechCapabilities(
  providerStatus: SpeechCapabilities["providerStatus"],
): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "AI-generated voice",
    maximumRecordingSeconds: 60,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 12000,
    providerStatus,
    synthesisModel: "gpt-4o-mini-tts",
    transcriptionModel: "gpt-4o-transcribe",
    voiceCatalog: {
      provider: "openai",
      version: "test-catalog",
      voiceIds: ["alloy", "marin", "cedar"],
    },
  };
}

function providerSelection(provider: SpeechProviderSelectionSettings["provider"]) {
  return {
    defaultProvider: "local_macos",
    provider,
    supportedProviders: ["local_macos", "openai"],
  } satisfies SpeechProviderSelectionSettings;
}

function localVoiceHealth(status: LocalMacOSVoiceHealth["status"]): LocalMacOSVoiceHealth {
  if (status === "ready") {
    return {
      helperPath: "/tmp/setta-local-helper",
      modelPath: "/tmp/ggml-base.en.bin",
      modelSHA256: "model-sha",
      provider: "local_macos",
      status,
    };
  }
  if (status === "missing_model") {
    return {
      message: "The configured Whisper model file is missing.",
      modelPath: "/tmp/ggml-base.en.bin",
      provider: "local_macos",
      status,
    };
  }
  return {
    helperPath: null,
    message: "The local macOS voice helper is not installed.",
    provider: "local_macos",
    status: "helper_unavailable",
  };
}

function localModelDownloadStatus(
  status: "downloading" | "idle",
): LocalMacOSVoiceModelDownloadStatus {
  const base = {
    bytesTotal: 147_964_211,
    modelName: "base.en",
    modelPath: "/tmp/ggml-base.en.bin",
    modelSHA256: "a".repeat(64),
    provider: "local_macos" as const,
  };
  if (status === "downloading") {
    return {
      ...base,
      bytesDownloaded: 25_000_000,
      status,
    };
  }
  return {
    ...base,
    status,
  };
}

function sampleMasterVoiceSelection(): MasterVoiceSelection {
  return {
    requestedVoiceId: "marin",
    resolvedVoiceId: "marin",
    reuse: null,
    selection: "exact",
    updatedAt: "2026-07-18T12:00:00Z",
  };
}

function sampleNarratorVoiceDefault(): NarratorVoiceDefault {
  return {
    requestedVoiceId: null,
    selection: "auto_distinct",
    updatedAt: "2026-07-18T12:00:00Z",
  };
}

function runtimeSnapshot({
  connectionStatus,
}: {
  connectionStatus: RuntimeConnectionStatus;
}): RuntimeRegistrySnapshot {
  return {
    activeRuntimeId: "remote-runtime",
    connection: {
      message:
        connectionStatus === "connected" ? "Connected to Remote lab" : "Connecting to Remote lab",
      protocolVersion: connectionStatus === "connected" ? 63 : null,
      runtimeId: "remote-runtime",
      status: connectionStatus,
      updatedAt: "2026-07-18T12:00:00.000Z",
    },
    runtimes: [
      {
        active: true,
        baseUrl: "https://remote-runtime.example",
        connectionMessage:
          connectionStatus === "connected" ? "Connected to Remote lab" : "Connecting to Remote lab",
        connectionStatus,
        displayName: "Remote lab",
        infrastructureProvider: {
          displayName: "Manual",
          iconUrl: "",
          id: "manual",
        },
        isLocal: false,
        lastConnected: null,
        runtimeId: "remote-runtime",
      },
    ],
    switching: connectionStatus === "connecting",
  };
}

function selectTagDisabled(html: string, ariaLabel: string): boolean {
  const match = new RegExp(`<select[^>]*aria-label="${ariaLabel}"[^>]*>`, "u").exec(html);
  if (!match) {
    throw new Error(`Missing select with aria-label ${ariaLabel}.`);
  }
  return /\sdisabled(=|\s|>)/u.test(match[0]);
}

function sampleRoleConfiguration(): RoleConfiguration {
  const profiles = [
    sampleRoleProfile("agent", "gpt-5.6-sol", "high"),
    sampleRoleProfile("narrator", "gpt-5.4-mini", "low"),
    sampleRoleProfile("master", "gpt-5.6-terra", "medium"),
    sampleRoleProfile("side_agent", "gpt-5.6-luna", "medium"),
  ];
  return {
    modelCatalog: {
      defaultModelId: "gpt-5.6-sol",
      models: profiles.map((profile, index) => ({
        defaultReasoningEffort: profile.reasoningEffort,
        defaultServiceTier: null,
        description: `${profile.modelSelection.modelId} test model`,
        displayName: profile.modelSelection.modelId ?? "provider default",
        isDefault: index === 0,
        modelId: profile.modelSelection.modelId ?? "",
        provider: "codex",
        serviceTiers: [],
        supportedReasoningEfforts: [profile.reasoningEffort],
      })),
      provider: "codex",
    },
    profiles: profiles.map((profile) => ({
      builtIn: profile,
      effective: profile,
      effectiveSource: "built_in",
      override: null,
      resolved: {
        modelId: profile.modelSelection.modelId ?? "",
        reasoningEffort: profile.reasoningEffort,
        serviceTier: null,
      },
      role: profile.role,
    })),
    schemaVersion: 1,
    scope: { conversationId: null, kind: "global", workspaceId: null },
  };
}

function sampleRoleProfile(role: Role, modelId: string, effort: string): RoleProfile {
  return {
    contextBudget: {
      maxInputBytes: 65536,
      maxInputTokens: 16384,
      reservedOutputTokens: 2048,
    },
    modelSelection: { mode: "exact", modelId },
    permissionProfile: {
      approvalPolicy: "never",
      approvals: false,
      providerPermissionProfile: role === "agent" ? ":workspace" : ":read-only",
      toolAccess: {
        allowedTools: [],
        mode: role === "narrator" ? "none" : "all",
      },
      workspaceMutation: role === "agent",
    },
    provider: "codex",
    reasoningEffort: effort,
    role,
    serviceTier: null,
  };
}

function sampleAppearanceSettings(): AppearanceSettings {
  const tailwind = sampleTailwindPalette();
  return {
    dark: sampleColorScheme(tailwind, 200),
    developer: {
      allowResizedPanesToOverflowViewport: false,
      overviewCardMaxWidthPx: 460,
      overviewCardMinWidthPx: 280,
      showPerformanceStats: false,
    },
    fonts: {
      heading: `"Aptos Display", ui-sans-serif, sans-serif`,
      mono: `"SFMono-Regular", Consolas, monospace`,
      sans: `"Aptos", ui-sans-serif, sans-serif`,
    },
    light: sampleColorScheme(tailwind, 100),
    mode: "dark",
    schemaVersion: 3,
    shortcuts: {
      workspaceNavigation: "mod_alt_arrows",
      masterVoice: "mod_shift_k",
    },
  };
}

function sampleAppearancePresets(): AppearancePreset[] {
  return [
    {
      description: "Default Setta appearance",
      id: "setta_standard",
      name: "Setta Standard",
      settings: sampleAppearanceSettings(),
    },
    {
      description: "Neutral Tailwind appearance",
      id: "tailwind_neutral",
      name: "Tailwind Neutral",
      settings: sampleAppearanceSettings(),
    },
    {
      description: "Mauve shadcn/ui appearance",
      id: "shadcn_mauve",
      name: "shadcn/ui Mauve",
      settings: sampleAppearanceSettings(),
    },
  ];
}

function sampleColorScheme(
  tailwind: AppearanceTailwindPalette,
  offset: number,
): AppearanceColorScheme {
  return {
    accent: sampleAccentPalette(offset + 60),
    shadcn: sampleShadcnPalette(offset),
    status: sampleStatusPalette(offset + 40),
    tailwind,
    workspace: sampleWorkspacePalette(offset + 80),
  };
}

function sampleTailwindPalette(): AppearanceTailwindPalette {
  return {
    setta50: color(1),
    setta100: color(2),
    setta150: color(3),
    setta200: color(4),
    setta300: color(5),
    setta400: color(6),
    setta500: color(7),
    setta600: color(8),
    setta700: color(9),
    setta750: color(10),
    setta800: color(11),
    setta850: color(12),
    setta860: color(13),
    setta875: color(14),
    setta900: color(15),
    setta925: color(16),
    setta950: color(17),
    setta975: color(18),
  };
}

function sampleShadcnPalette(offset: number): AppearanceShadcnPalette {
  return {
    accent: color(offset + 10),
    accentForeground: color(offset + 11),
    background: color(offset),
    border: color(offset + 16),
    card: color(offset + 2),
    cardForeground: color(offset + 3),
    destructive: color(offset + 14),
    destructiveForeground: color(offset + 15),
    foreground: color(offset + 1),
    input: color(offset + 17),
    muted: color(offset + 8),
    mutedForeground: color(offset + 9),
    popover: color(offset + 4),
    popoverForeground: color(offset + 5),
    primary: color(offset + 6),
    primaryForeground: color(offset + 7),
    ring: color(offset + 18),
    secondary: color(offset + 12),
    secondaryForeground: color(offset + 13),
    sidebar: color(offset + 19),
    sidebarAccent: color(offset + 21),
    sidebarAccentForeground: color(offset + 22),
    sidebarForeground: color(offset + 20),
  };
}

function sampleStatusPalette(offset: number): AppearanceStatusPalette {
  return {
    alert: color(offset + 6),
    alertForeground: color(offset + 7),
    critical: color(offset + 8),
    criticalForeground: color(offset + 9),
    info: color(offset),
    infoForeground: color(offset + 1),
    success: color(offset + 2),
    successForeground: color(offset + 3),
    warning: color(offset + 4),
    warningForeground: color(offset + 5),
  };
}

function sampleAccentPalette(offset: number): AppearanceAccentPalette {
  return {
    amber: color(offset + 5),
    blue: color(offset + 1),
    cyan: color(offset),
    green: color(offset + 6),
    magenta: color(offset + 3),
    red: color(offset + 4),
    teal: color(offset + 7),
    violet: color(offset + 2),
  };
}

function sampleWorkspacePalette(offset: number): AppearanceWorkspacePalette {
  return {
    dotGrid: color(offset + 1),
    dragTargetOutline: color(offset + 8),
    dragTargetSurface: color(offset + 7),
    paneEdge: color(offset + 4),
    paneSelectedGlow: color(offset + 6),
    paneSelectedOutline: color(offset + 5),
    paneSurface: color(offset + 2),
    paneTitleBarSurface: color(offset + 3),
    surface: color(offset),
  };
}

function color(hue: number) {
  return `oklch(0.5000 0.1000 ${hue.toFixed(2)})`;
}
