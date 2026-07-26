import type {
  AppearanceColorMode,
  AppearanceColorScheme,
  AppearanceFontScheme,
  AppearancePreset,
  AppearancePresetID,
  AppearanceSettings,
} from "@generated/backend";
import { create } from "zustand";

export type AppearanceStoreStatus = "idle" | "loading" | "ready" | "saving" | "error";
export type AppearanceColorGroup = keyof AppearanceColorScheme;

const appearanceReadTimeoutMs = 5_000;
const settaLogoDark = "oklch(0.8460 0.1292 213.38)";
const settaLogoLight = "oklch(0.5800 0.1300 213.38)";

interface AppearanceStore {
  applyDraftSettings: (settings: AppearanceSettings) => void;
  defaultPresetId: AppearancePresetID | null;
  draft: AppearanceSettings | null;
  error: string | null;
  load: () => Promise<void>;
  presets: AppearancePreset[];
  revertDraft: () => void;
  saveDraft: () => Promise<void>;
  settings: AppearanceSettings | null;
  setColorValue: (
    mode: AppearanceColorMode,
    group: AppearanceColorGroup,
    name: string,
    value: string,
  ) => void;
  setFontValue: (name: keyof AppearanceFontScheme, value: string) => void;
  setMode: (mode: AppearanceColorMode) => void;
  status: AppearanceStoreStatus;
}

export const useAppearanceStore = create<AppearanceStore>((set, get) => {
  function updateDraft(update: (settings: AppearanceSettings) => AppearanceSettings) {
    const draft = get().draft;
    if (!draft) {
      return;
    }
    const next = update(draft);
    applyAppearanceSettings(next);
    set({ draft: next, error: null });
  }

  return {
    applyDraftSettings: (settings) => {
      applyAppearanceSettings(settings);
      set({ draft: settings, error: null, status: "ready" });
    },
    defaultPresetId: null,
    draft: null,
    error: null,
    load: async () => {
      const { settings, status } = get();
      if (settings || status === "loading" || status === "saving") {
        return;
      }
      set({ error: null, status: "loading" });
      try {
        const next = await withTimeout(
          window.setta.appearance.read(),
          "Appearance settings",
          appearanceReadTimeoutMs,
        );
        applyAppearanceSettings(next);
        set({
          draft: next,
          error: null,
          settings: next,
          status: "ready",
        });
        void loadAppearancePresets(set);
      } catch (error) {
        set({ error: errorMessage(error), status: "error" });
      }
    },
    presets: [],
    revertDraft: () => {
      const settings = get().settings;
      if (!settings) {
        return;
      }
      applyAppearanceSettings(settings);
      set({ draft: settings, error: null, status: "ready" });
    },
    saveDraft: async () => {
      const draft = get().draft;
      if (!draft) {
        return;
      }
      set({ error: null, status: "saving" });
      try {
        const next = await window.setta.appearance.update({ settings: draft });
        applyAppearanceSettings(next);
        set({ draft: next, error: null, settings: next, status: "ready" });
      } catch (error) {
        set({ error: errorMessage(error), status: "error" });
      }
    },
    settings: null,
    setColorValue: (mode, group, name, value) => {
      updateDraft((settings) => updateAppearanceColor(settings, mode, group, name, value));
    },
    setFontValue: (name, value) => {
      updateDraft((settings) => ({
        ...settings,
        fonts: { ...settings.fonts, [name]: value },
      }));
    },
    setMode: (mode) => {
      updateDraft((settings) => ({ ...settings, mode }));
    },
    status: "idle",
  };
});

async function loadAppearancePresets(set: (state: Partial<AppearanceStore>) => void) {
  try {
    const presetList = await window.setta.appearance.presets();
    set({
      defaultPresetId: presetList.defaultPresetId,
      presets: presetList.presets,
    });
  } catch (error) {
    set({ error: errorMessage(error) });
  }
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = globalThis.setTimeout(() => {
      reject(new Error(`${label} request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      globalThis.clearTimeout(timeout);
    }
  }
}

export function updateAppearanceColor(
  settings: AppearanceSettings,
  mode: AppearanceColorMode,
  group: AppearanceColorGroup,
  name: string,
  value: string,
): AppearanceSettings {
  return {
    ...settings,
    [mode]: {
      ...settings[mode],
      [group]: {
        ...settings[mode][group],
        [name]: value,
      },
    },
  };
}

export function appearanceSettingsEqual(
  left: AppearanceSettings | null,
  right: AppearanceSettings | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyAppearanceSettings(settings: AppearanceSettings) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.dataset.colorMode = settings.mode;
  root.style.colorScheme = settings.mode;
  for (const [name, value] of Object.entries(appearanceStyleVariables(settings))) {
    root.style.setProperty(name, value);
  }
}

export function appearanceStyleVariables(settings: AppearanceSettings): Record<string, string> {
  const scheme = settings[settings.mode];
  return {
    ...tailwindVariables(scheme),
    ...shadcnVariables(scheme),
    ...statusVariables(scheme),
    ...accentVariables(scheme),
    "--font-heading": settings.fonts.heading,
    "--font-mono": settings.fonts.mono,
    "--font-sans": settings.fonts.sans,
    "--setta-logo": settings.mode === "light" ? settaLogoLight : settaLogoDark,
    "--setta-font-heading": settings.fonts.heading,
    "--setta-font-mono": settings.fonts.mono,
    "--setta-font-sans": settings.fonts.sans,
  };
}

function tailwindVariables(scheme: AppearanceColorScheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scheme.tailwind).flatMap(([name, value]) => {
      const shade = tailwindColorShade(name);
      return [
        [`--setta-${shade}`, value],
        [`--color-setta-${shade}`, value],
      ];
    }),
  );
}

function shadcnVariables(scheme: AppearanceColorScheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scheme.shadcn).map(([name, value]) => [`--${kebabCase(name)}`, value]),
  );
}

function statusVariables(scheme: AppearanceColorScheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scheme.status).flatMap(([name, value]) => {
      const token = kebabCase(name);
      return [
        [`--status-${token}`, value],
        [`--color-status-${token}`, value],
      ];
    }),
  );
}

function accentVariables(scheme: AppearanceColorScheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scheme.accent).flatMap(([name, value]) => [
      [`--accent-${name}`, value],
      [`--color-accent-${name}`, value],
    ]),
  );
}

function tailwindColorShade(name: string) {
  return name.replace(/^setta/, "");
}

function kebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Appearance settings operation failed";
}
