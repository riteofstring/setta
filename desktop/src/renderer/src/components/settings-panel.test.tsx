import type {
  AppearanceAccentPalette,
  AppearanceColorScheme,
  AppearancePreset,
  AppearanceSettings,
  AppearanceShadcnPalette,
  AppearanceStatusPalette,
  AppearanceTailwindPalette,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { appearanceStyleVariables, updateAppearanceColor } from "../stores/appearance-store";
import { DeveloperSettingsEditor } from "./developer-settings";
import { AppearanceSettingsEditor, SettingsPanel } from "./settings-panel";

describe("appearance settings", () => {
  test("renders theme as the default settings subtab", () => {
    const html = renderToString(<SettingsPanel />);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Theme");
    expect(html).toContain("Shortcuts");
    expect(html).toContain("Developer");
    expect(html).toContain("Codex Account");
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Loading theme settings");
    expect(html).not.toContain('data-testid="codex-account-settings"');
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
    schemaVersion: 3,
    shortcuts: {
      workspaceNavigation: "mod_alt_arrows",
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

function color(hue: number) {
  return `oklch(0.5000 0.1000 ${hue.toFixed(2)})`;
}
