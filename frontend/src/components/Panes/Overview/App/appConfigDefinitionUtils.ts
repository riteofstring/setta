import type { Spec } from "@json-render/core";
import { createEmptySpec } from "utils/appSpecPatchStream";
import { type AppDefinition } from "utils/generatedTypes";
import { type AppThemeMode } from "./appDraftPreview";

export type AppSpecPayload = Record<string, unknown>;

export const DEFAULT_CATALOG_ID = "setta.app.default";
export const DEFAULT_SPEC_VERSION = "v1";
export const DEFAULT_THEME_MODE: AppThemeMode = "auto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveThemeMode(theme: unknown): AppThemeMode {
  if (isRecord(theme)) {
    const mode = theme.mode;
    if (mode === "light" || mode === "dark" || mode === "auto") {
      return mode;
    }
  }
  return DEFAULT_THEME_MODE;
}

export function buildDefaultSpec(): AppSpecPayload {
  const root: AppSpecPayload = {
    key: "app-root",
    type: "Stack",
    props: {
      direction: "column",
      gap: 20,
    },
    children: [
      {
        key: "app-overview",
        type: "Card",
        props: {
          title: "Standalone App Starter",
          description:
            "A clean baseline layout with guided input, a primary action, and output rendering.",
        },
      },
      {
        key: "app-inputs",
        type: "Card",
        props: {
          title: "Inputs",
          description: "Map Setta params to user-facing controls.",
        },
        children: [
          {
            key: "app-primary-param",
            type: "ParamInput",
            props: {
              sectionId: "SECTION_ID",
              paramId: "PARAM_ID",
              label: "Primary Parameter",
            },
          },
          {
            key: "app-run",
            type: "ActionButton",
            props: {
              label: "Generate Output",
              action: "run",
              sectionId: "SECTION_ID",
            },
          },
        ],
      },
      {
        key: "app-output",
        type: "Card",
        props: {
          title: "Output",
          description: "Preview section output in-place.",
        },
        children: [
          {
            key: "app-text-output",
            type: "TextOutput",
            props: {
              sectionId: "SECTION_ID",
              label: "Result",
            },
          },
        ],
      },
    ],
  };
  return {
    root,
    elements: buildElementIndex(root),
  };
}

function buildElementIndex(
  root: AppSpecPayload,
): Record<string, AppSpecPayload> {
  const elements: Record<string, AppSpecPayload> = {};
  const stack: AppSpecPayload[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const key = current.key;
    if (typeof key !== "string" || elements[key]) {
      continue;
    }
    elements[key] = current;
    const children = current.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === "object") {
          stack.push(child as AppSpecPayload);
        }
      }
    }
  }
  return elements;
}

export function parseThemePayloadForRequest({
  draftTheme,
  themeMode,
}: {
  draftTheme: string;
  themeMode: AppThemeMode;
}):
  | {
      ok: true;
      value: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    } {
  if (draftTheme.trim().length === 0) {
    return { ok: true, value: { mode: themeMode } };
  }
  let rawTheme: unknown;
  try {
    rawTheme = JSON.parse(draftTheme) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in theme." };
  }
  if (!isRecord(rawTheme)) {
    return { ok: false, error: "Theme JSON must be an object." };
  }
  return {
    ok: true,
    value: {
      ...rawTheme,
      mode: themeMode,
    },
  };
}

export function parseAssetsPayloadForRequest(
  draftAssets: string,
): { ok: true; value: unknown[] } | { ok: false; error: string } {
  if (draftAssets.trim().length === 0) {
    return { ok: true, value: [] };
  }
  let rawAssets: unknown;
  try {
    rawAssets = JSON.parse(draftAssets) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in assets." };
  }
  if (!Array.isArray(rawAssets)) {
    return { ok: false, error: "Assets JSON must be a list." };
  }
  return { ok: true, value: rawAssets };
}

export function parseSpecPayloadForRequest(
  draftSpec: string,
): { ok: true; value: AppSpecPayload } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draftSpec) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in app spec." };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "App spec JSON must be an object." };
  }
  return { ok: true, value: parsed };
}

function cloneSpecSeed(spec: unknown): Spec {
  return structuredClone(spec) as Spec;
}

export function cloneSpecForPreview(spec: Spec): Spec {
  return cloneSpecSeed(spec);
}

export function buildSpecSeed({
  draftSpec,
  persistedSpec,
}: {
  draftSpec: string;
  persistedSpec: AppDefinition["appSpec"] | unknown;
}): Spec {
  if (draftSpec.trim().length > 0) {
    try {
      const parsed = JSON.parse(draftSpec) as unknown;
      if (isRecord(parsed)) {
        return cloneSpecSeed(parsed);
      }
    } catch {
      // Keep stream generation resilient even if the draft text is currently invalid.
    }
  }
  if (isRecord(persistedSpec)) {
    return cloneSpecSeed(persistedSpec);
  }
  return createEmptySpec();
}
