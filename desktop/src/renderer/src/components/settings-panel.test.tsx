import type {
  AppearanceColorScheme,
  AppearancePreset,
  AppearanceSettings,
  AppearanceShadcnPalette,
  AppearanceStatusPalette,
  AppearanceTailwindPalette,
  CartographerProcessingState,
  CartographerRun,
  ChatModelOption,
  SemanticCartographerSettingsInput,
  SemanticCartographerSettingsMetadata,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { appearanceStyleVariables, updateAppearanceColor } from "../stores/appearance-store";
import { useSemanticCartographerSettingsStore } from "../stores/semantic-cartographer-settings-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { DeveloperSettingsEditor } from "./developer-settings";
import { SemanticCartographerSettingsEditor } from "./semantic-cartographer-settings";
import { AppearanceSettingsEditor, SettingsPanel } from "./settings-panel";

describe("appearance settings", () => {
  beforeEach(() => {
    useSemanticCartographerSettingsStore.setState({
      dirty: false,
      draft: null,
      error: null,
      fieldErrors: {},
      metadata: null,
      modelOptions: [],
      modelOptionsWorkspaceId: null,
      processingState: null,
      recentRuns: [],
      record: null,
      selectedWorkspaceId: null,
      status: "idle",
    });
    useWorkspaceStore.setState({
      error: null,
      operation: null,
      session: {
        activeWorkspaces: [],
        recentWorkspaces: [],
        selectedWorkspaceId: "workspace_settings",
      },
      status: "ready",
    });
  });

  test("renders theme as the default settings subtab", () => {
    const html = renderToString(<SettingsPanel />);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Theme");
    expect(html).toContain("Developer");
    expect(html).toContain("Codex Account");
    expect(html).toContain("Cartographer");
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Loading theme settings");
    expect(html).not.toContain('data-testid="codex-account-settings"');
  });

  test("renders cartographer settings read-only without a selected workspace", () => {
    useWorkspaceStore.setState({
      session: { activeWorkspaces: [], recentWorkspaces: [], selectedWorkspaceId: "" },
    });
    const html = renderToString(
      cartographerEditor({
        draft: sampleCartographerSettingsInput(),
        metadata: sampleCartographerMetadata(),
        processingState: sampleCartographerProcessingState(),
        selectedWorkspaceId: "",
        status: "ready",
      }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain('data-testid="semantic-cartographer-settings"');
    expect(html).toContain("Open a workspace to validate and save cartographer settings.");
    expect(html).toContain("Automatic processing");
    expect(html).toContain("disabled");
  });

  test("renders provider-default and explicit cartographer model controls", () => {
    const html = renderToString(
      cartographerEditor({
        draft: sampleCartographerSettingsInput(),
        metadata: sampleCartographerMetadata(),
        modelOptions: sampleCartographerModelOptions(),
        processingState: sampleCartographerProcessingState(),
        recentRuns: [sampleCartographerRun()],
        status: "ready",
      }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Provider default");
    expect(html).toContain("Explicit model");
    expect(html).toContain("Default: GPT Default");
    expect(html).toContain("Low");
    expect(html).toContain("Runtime");
    expect(html).toContain("applied");
  });

  test("shows unsupported saved cartographer model and reasoning values", () => {
    const settings = sampleCartographerSettingsInput();
    settings.liveTaskConfig = {
      inputBudget: 6000,
      modelId: "missing-model",
      modelSelection: "explicit",
      reasoningEffort: "xhigh",
    };
    const html = renderToString(
      cartographerEditor({
        dirty: true,
        draft: settings,
        fieldErrors: {
          "liveTaskConfig.modelId": "Model is not in the current Codex catalog.",
          "liveTaskConfig.reasoningEffort": "Reasoning effort is not supported by GPT Default.",
        },
        metadata: sampleCartographerMetadata({ settings }),
        modelOptions: sampleCartographerModelOptions(),
        processingState: sampleCartographerProcessingState(),
        status: "ready",
      }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Unsupported: missing-model");
    expect(html).toContain("Unsupported: xhigh");
    expect(html).toContain("Model is not in the current Codex catalog.");
    expect(html).toContain("cartographer setting needs attention");
  });

  test("renders cartographer dirty and saving button states", () => {
    const html = renderToString(
      cartographerEditor({
        dirty: true,
        draft: sampleCartographerSettingsInput(),
        metadata: sampleCartographerMetadata(),
        modelOptions: sampleCartographerModelOptions(),
        processingState: sampleCartographerProcessingState(),
        status: "saving",
      }),
    );

    expect(html).toContain("Saving cartographer settings");
    expect(html).toContain("Save");
    expect(html).toContain("disabled");
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
    expect(html).toContain("Color scheme");
    expect(html).toContain("Light");
    expect(html).toContain("Dark");
    expect(html).toContain("Fonts");
    expect(html).toContain("Advanced Color Tokens");
    expect(html).toContain("Palette Scale");
    expect(html).toContain("shadcn/ui Tokens");
    expect(html).toContain("Status Colors");
    expect(html).toContain("Setta 900");
    expect(html).toContain("Card foreground");
    expect(html).toContain("Warning foreground");
  });
});

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
    schemaVersion: 2,
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
    shadcn: sampleShadcnPalette(offset),
    status: sampleStatusPalette(offset + 40),
    tailwind,
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

type CartographerEditorProps = Parameters<typeof SemanticCartographerSettingsEditor>[0];

function cartographerEditor(overrides: Partial<CartographerEditorProps>) {
  return <SemanticCartographerSettingsEditor {...cartographerEditorProps(overrides)} />;
}

function cartographerEditorProps(
  overrides: Partial<CartographerEditorProps>,
): CartographerEditorProps {
  return {
    dirty: false,
    draft: null,
    error: null,
    fieldErrors: {},
    metadata: null,
    modelOptions: [],
    onAuditCaptureLevelChange: vi.fn(),
    onAutomaticProcessingEnabledChange: vi.fn(),
    onNumberFieldChange: vi.fn(),
    onRefresh: async () => {},
    onReset: vi.fn(),
    onRevert: vi.fn(),
    onSave: async () => {},
    onTaskInputBudgetChange: vi.fn(),
    onTaskModelIdChange: vi.fn(),
    onTaskModelSelectionChange: vi.fn(),
    onTaskReasoningEffortChange: vi.fn(),
    processingState: null,
    recentRuns: [],
    selectedWorkspaceId: "workspace_settings",
    status: "idle",
    ...overrides,
  };
}

function sampleCartographerSettingsInput(): SemanticCartographerSettingsInput {
  return {
    auditConfig: { captureLevel: "standard" },
    automaticProcessingEnabled: true,
    finalSynthesisTaskConfig: {
      inputBudget: 12000,
      modelId: "",
      modelSelection: "provider_default",
      reasoningEffort: "medium",
    },
    liveTaskConfig: {
      inputBudget: 6000,
      modelId: "",
      modelSelection: "provider_default",
      reasoningEffort: "low",
    },
    observationConfig: {
      assistantThresholdBytes: 4096,
      maxWindowContentBytes: 8192,
      maxWindowEvents: 24,
      outputThresholdBytes: 4096,
      priorSummaryLimit: 8,
      quietCloseAfterSeconds: 120,
      tokenBudget: 6000,
    },
    processingConfig: {
      leaseDurationSeconds: 600,
      maxConcurrent: 2,
      maxQueuedPerSource: 8,
      perSourceConcurrent: 1,
    },
  };
}

function sampleCartographerMetadata({
  settings = sampleCartographerSettingsInput(),
}: {
  settings?: SemanticCartographerSettingsInput;
} = {}): SemanticCartographerSettingsMetadata {
  return {
    defaultSettings: sampleCartographerSettingsInput(),
    numberBounds: [
      { field: "liveTaskConfig.inputBudget", min: 1 },
      { field: "finalSynthesisTaskConfig.inputBudget", min: 1 },
      { field: "processingConfig.maxConcurrent", min: 1 },
      { field: "processingConfig.perSourceConcurrent", min: 1 },
      { field: "processingConfig.maxQueuedPerSource", min: 1 },
      { field: "processingConfig.leaseDurationSeconds", min: 1 },
      { field: "observationConfig.maxWindowEvents", min: 1 },
      { field: "observationConfig.maxWindowContentBytes", min: 1 },
      { field: "observationConfig.assistantThresholdBytes", min: 1 },
      { field: "observationConfig.outputThresholdBytes", min: 1 },
      { field: "observationConfig.priorSummaryLimit", min: 1 },
      { field: "observationConfig.tokenBudget", min: 1 },
      { field: "observationConfig.quietCloseAfterSeconds", min: 1 },
    ],
    record: {
      createdAt: "2026-06-15T12:00:00Z",
      id: "global",
      settings: {
        ...settings,
        schemaVersion: 1,
        updatedAt: "2026-06-15T12:00:00Z",
      },
      settingsHash: "sha256:cartographer",
      updatedAt: "2026-06-15T12:00:00Z",
    },
    relationships: [
      {
        comparedField: "processingConfig.maxConcurrent",
        field: "processingConfig.perSourceConcurrent",
        operator: "lte",
      },
    ],
  };
}

function sampleCartographerModelOptions(): ChatModelOption[] {
  return [
    {
      defaultReasoningEffort: "medium",
      description: "Default model",
      displayName: "GPT Default",
      hidden: false,
      id: "gpt-default",
      isDefault: true,
      model: "gpt-default",
      supportedReasoningEfforts: [
        {
          description: "Low reasoning",
          displayName: "Low",
          effort: "low",
          isDefault: false,
        },
        {
          description: "Medium reasoning",
          displayName: "Medium",
          effort: "medium",
          isDefault: true,
        },
      ],
    },
  ];
}

function sampleCartographerProcessingState(): CartographerProcessingState {
  return {
    completedNoopRunCount: 0,
    concurrencyGuidance: "",
    createdSemanticEventIds: [],
    durableQueuedWindowCount: 0,
    durableRunningWindowCount: 0,
    effectiveProcessingConfig: {
      leaseDurationSeconds: 600,
      maxConcurrent: 2,
      maxQueuedPerSource: 8,
      perSourceConcurrent: 1,
    },
    enabled: true,
    failedRunCount: 0,
    lastAppliedAt: "",
    lastAppliedPatchId: "",
    lastFailure: null,
    lastFailureRunSummary: null,
    lastNoopAt: "",
    lastNoopReason: "",
    lastNoopRunId: "",
    lastProcessedAt: "",
    lastProcessedRunId: "",
    lastProcessedRunSummary: null,
    lastProcessedWindowId: "",
    lastProcessedWorkspaceId: "",
    lastSupersededAt: "",
    lastSupersededWindowId: "",
    maxConcurrent: 2,
    pendingReviewPatchCount: 0,
    perSourceConcurrent: 1,
    queuedWindowCount: 0,
    queuedWindows: [],
    runningWindowCount: 0,
    runningWindows: [],
    settingsHash: "sha256:cartographer",
    staleLeaseCount: 0,
    started: true,
    supersededWindowCount: 0,
  };
}

function sampleCartographerRun(): CartographerRun {
  return {
    id: "cartographer_run_settings",
    inputBundleBytes: 2048,
    reportedModel: "gpt-default",
    requestedModelSelection: "provider_default",
    requestedReasoningEffort: "low",
    status: "applied",
    taskProfile: "live_window",
    totalDurationMs: 125,
  } as CartographerRun;
}

function color(hue: number) {
  return `oklch(0.5000 0.1000 ${hue.toFixed(2)})`;
}
