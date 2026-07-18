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
  Role,
  RoleConfiguration,
  RoleProfile,
} from "@generated/backend";
import type { SpeechCredentialSettings } from "@shared/speech-ipc";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { appearanceStyleVariables, updateAppearanceColor } from "../stores/appearance-store";
import { DeveloperSettingsEditor } from "./developer-settings";
import { OpenAIVoiceConnectionCardView } from "./openai-voice-connection-card";
import { ConversationPresentationConfiguration } from "./presentation-configuration-settings";
import { RoleConfigurationForm, RoleConfigurationSettings } from "./role-configuration-settings";
import { AppearanceSettingsEditor, SettingsPanel } from "./settings-panel";

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
    expect(html).toContain("Applies to Local only");
    expect(html).toContain("OpenAI API key");
    expect(html).toContain('type="password"');
    expect(html).toContain("Save and verify");
    expect(html).toContain("OpenAI API keys");
    expect(html).not.toContain("OPENAI_API_KEY");
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
    expect(corrupt).not.toContain('type="password"');
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
      approvalPolicy: role === "narrator" || role === "master" ? "never" : "on-request",
      approvals: role !== "narrator" && role !== "master",
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
