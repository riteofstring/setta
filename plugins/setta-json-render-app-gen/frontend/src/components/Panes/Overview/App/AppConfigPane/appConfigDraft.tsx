import {
  type AppDefinitionValidationResult,
  buildDefaultAppSpecPath,
  callOpenAPI,
  getErrorDetail,
  getAppDefinition,
  res200,
  setAppDefinition,
  validateAppDefinition,
} from "@setta/app-subsystem-frontend-sdk";

import {
  PaneAccordion,
  type PaneAccordionItem,
} from "../../../ui/PaneAccordion";

import { useAppPreview } from "../../../../appSubsystemProjectState";

import { useAppDefinition } from "../../../../appSubsystemDefinitionState";

import {
  useAppSubsystemFrontendHost,
  useAppSubsystemProjectContext,
} from "../../../../appSubsystemFrontendHostContext";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { type AppDefinition } from "../../../../appSubsystemContracts";

import { getRegisteredAppSubsystemPluginId } from "../../../../appSubsystemPluginHost";

import {
  parseDraftAppAssets,
  parseDraftAppSpec,
  parseDraftAppSpecPayload,
  parseDraftAppTheme,
  type AppThemeMode,
  type AppSpecDraftPayload,
} from "./appDraftPreview";

import { AppConfigPane } from "./appConfigPane";

export type ProjectMetadataOption = {
  id: string;
  name: string;
};

export type NormalizedAppDefinitionValidationResult =
  AppDefinitionValidationResult & {
    errors: NonNullable<AppDefinitionValidationResult["errors"]>;
    warnings: NonNullable<AppDefinitionValidationResult["warnings"]>;
  };

export type HydratedAppDefinition = {
  savedSpec: unknown;
  savedDefinition: AppDefinition | null;
};

export type HydratedAppDraftState = {
  appSpec: unknown;
  appDefinition: AppDefinition | null;
  draftSpec: string;
  catalogId: string;
  specVersion: string;
  appSpecPath: string;
  draftTheme: string;
  draftAssets: string;
  themeMode: AppThemeMode;
  previewSpecOverride: Record<string, unknown> | null;
  previewThemeOverride: Record<string, unknown> | null;
  previewAssetsOverride: unknown[];
};

export type ParsedAppDefinitionRequest = {
  catalogId?: string;
  appSpecVersion?: string;
  appSpecPath?: string;
  theme: Record<string, unknown>;
  assets: unknown[];
};

export const DEFAULT_CATALOG_ID = "setta.app.default";

export const DEFAULT_SPEC_VERSION = "v1";

export const DEFAULT_THEME_MODE: AppThemeMode = "auto";

export const ADVANCED_ACCORDION_TRIGGER_ENABLED_CLASSES =
  "group box-border flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-setta-100/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-setta-850/70 [&[data-state=open]_.app-config-advanced-chevron]:rotate-180";

export const ADVANCED_ACCORDION_TRIGGER_DISABLED_CLASSES =
  "group box-border flex w-full cursor-not-allowed items-start justify-between gap-3 px-3 py-2 text-left opacity-60";

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function buildDefaultSpec(): AppSpecDraftPayload {
  const root: AppSpecDraftPayload = {
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
    elements: buildElementIndex(root as AppSpecDraftPayload),
  };
}

export function buildElementIndex(
  root: AppSpecDraftPayload,
): Record<string, AppSpecDraftPayload> {
  const elements: Record<string, AppSpecDraftPayload> = {};
  const stack: AppSpecDraftPayload[] = [root];
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
          stack.push(child as AppSpecDraftPayload);
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

export function parseAssetsPayloadForRequest(draftAssets: string):
  | {
      ok: true;
      value: unknown[];
    }
  | {
      ok: false;
      error: string;
    } {
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

export function formatOptionalJson(value: unknown): string {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

export function trimOptionalInput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildHydratedAppMetadata(
  savedDefinition: AppDefinition | null,
) {
  return {
    catalogId: savedDefinition?.catalogId ?? DEFAULT_CATALOG_ID,
    specVersion: savedDefinition?.appSpecVersion ?? DEFAULT_SPEC_VERSION,
    appSpecPath: savedDefinition?.appSpecPath ?? "",
  };
}

export function buildHydratedPreviewState({
  savedAssets,
  savedSpec,
  savedTheme,
}: {
  savedAssets: unknown[];
  savedSpec: unknown;
  savedTheme: unknown;
}) {
  return {
    previewSpecOverride: isRecord(savedSpec) ? savedSpec : null,
    previewThemeOverride: isRecord(savedTheme) ? savedTheme : null,
    previewAssetsOverride: savedAssets,
  };
}

export function buildHydratedAppDraftState({
  savedSpec,
  savedDefinition,
}: HydratedAppDefinition): HydratedAppDraftState {
  const savedTheme = savedDefinition?.theme ?? null;
  const savedAssets = savedDefinition?.assets ?? [];
  const metadata = buildHydratedAppMetadata(savedDefinition);
  const previewState = buildHydratedPreviewState({
    savedAssets,
    savedSpec,
    savedTheme,
  });
  return {
    appSpec: savedSpec,
    appDefinition: savedDefinition,
    draftSpec: formatOptionalJson(savedSpec),
    ...metadata,
    draftTheme: formatOptionalJson(savedTheme),
    draftAssets: JSON.stringify(savedAssets, null, 2),
    themeMode: resolveThemeMode(savedTheme),
    ...previewState,
  };
}

export function buildAppDefinitionRequest({
  appSpecPath,
  catalogId,
  draftAssets,
  draftTheme,
  specVersion,
  themeMode,
}: {
  appSpecPath: string;
  catalogId: string;
  draftAssets: string;
  draftTheme: string;
  specVersion: string;
  themeMode: AppThemeMode;
}):
  | {
      ok: true;
      value: ParsedAppDefinitionRequest;
    }
  | {
      ok: false;
      error: string;
    } {
  const themePayload = parseThemePayloadForRequest({
    draftTheme,
    themeMode,
  });
  if (!themePayload.ok) {
    return themePayload;
  }
  const assetsPayload = parseAssetsPayloadForRequest(draftAssets);
  if (!assetsPayload.ok) {
    return assetsPayload;
  }
  return {
    ok: true,
    value: {
      appSpecPath: trimOptionalInput(appSpecPath),
      appSpecVersion: trimOptionalInput(specVersion),
      catalogId: trimOptionalInput(catalogId),
      theme: themePayload.value,
      assets: assetsPayload.value,
    },
  };
}

export function buildValidationSuccessMessage(warningCount: number): string {
  if (warningCount === 0) {
    return "Validation passed.";
  }
  return `Validation passed with ${warningCount} warning(s).`;
}

export function normalizeValidationResult(
  result: AppDefinitionValidationResult,
): NormalizedAppDefinitionValidationResult {
  return {
    ...result,
    errors: result.errors ?? [],
    warnings: result.warnings ?? [],
  };
}

export function ErrorMessageBanner({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
      {message}
    </div>
  );
}

export function ValidationResultPanel({
  result,
}: {
  result: NormalizedAppDefinitionValidationResult | null;
}) {
  if (!result) {
    return null;
  }
  const validationSummary = `${result.errors.length} error(s), ${result.warnings.length} warning(s)`;
  const catalogVersionLabel = result.capabilities.catalogVersion
    ? `(${result.capabilities.catalogVersion})`
    : "";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Validation
        </span>
        <span className="text-[11px] text-setta-500 dark:text-setta-400">
          {validationSummary}
        </span>
      </div>
      {result.errors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
          <div className="font-semibold">Errors</div>
          <ul className="mt-1 list-disc pl-4">
            {result.errors.map((err, idx) => (
              <li key={`${idx}-${err.message}`}>{err.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
          <div className="font-semibold">Warnings</div>
          <ul className="mt-1 list-disc pl-4">
            {result.warnings.map((warn, idx) => (
              <li key={`${idx}-${warn.message}`}>
                {warn.message}
                {warn.elementKey ? ` (element ${warn.elementKey})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="text-[11px] text-setta-500 dark:text-setta-400">
        Capabilities: {result.capabilities.catalogId} {catalogVersionLabel}
      </div>
    </div>
  );
}

export function AppConfigToolbar({
  hasDraft,
  isPreviewEnabled,
  loading,
  onCreateDefault,
  onSave,
  onTogglePreview,
  onValidate,
  validating,
}: {
  hasDraft: boolean;
  isPreviewEnabled: boolean;
  loading: boolean;
  onCreateDefault: () => void;
  onSave: () => void;
  onTogglePreview: () => void;
  onValidate: () => void;
  validating: boolean;
}) {
  const actionDisabled = loading || validating || !hasDraft;
  return (
    <>
      <header className="flex justify-end">
        <button
          className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={onTogglePreview}
          type="button"
        >
          {isPreviewEnabled ? "Hide Preview" : "Show Preview"}
        </button>
      </header>

      <div className="flex items-center justify-between text-xs text-setta-500 dark:text-setta-400">
        <span>App Spec JSON</span>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            disabled={loading}
            onClick={onCreateDefault}
            type="button"
          >
            Create Default
          </button>
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            disabled={actionDisabled}
            onClick={onValidate}
            type="button"
          >
            {validating ? "Validating..." : "Validate"}
          </button>
          <button
            className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionDisabled}
            onClick={onSave}
            type="button"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}

export function DraftSpecEditor({
  appSpec,
  draftSpec,
  draftSpecError,
  draftSpecRef,
  onDraftSpecChange,
}: {
  appSpec: unknown;
  draftSpec: string;
  draftSpecError: string | null;
  draftSpecRef: RefObject<HTMLTextAreaElement | null>;
  onDraftSpecChange: (value: string) => void;
}) {
  const placeholder = appSpec
    ? "Edit the app spec JSON."
    : "Paste a Setta app spec JSON object, or use Create Default.";
  return (
    <>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        Root elements must include <code>key</code> and <code>type</code>. Put
        child elements in top-level <code>children</code>; text uses{" "}
        <code>props.text</code>, and actions use <code>ActionButton</code>.
      </p>
      <textarea
        aria-label="App Spec JSON"
        className="min-h-[280px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
        defaultValue={draftSpec}
        placeholder={placeholder}
        ref={draftSpecRef}
        onChange={(event) => onDraftSpecChange(event.target.value)}
      />
      {draftSpecError ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
        >
          {draftSpecError}
        </div>
      ) : null}
    </>
  );
}

export function AppConfigAdvancedContent({
  appSpecPath,
  appSpecPathPlaceholder,
  catalogId,
  draftAssets,
  draftAssetsError,
  draftTheme,
  draftThemeError,
  onAppSpecPathChange,
  onCatalogIdChange,
  onDraftAssetsChange,
  onDraftThemeChange,
  onPreviewConfigIdChange,
  onSpecVersionChange,
  onThemeModeChange,
  previewConfigId,
  projectMetadata,
  specVersion,
  themeMode,
}: {
  appSpecPath: string;
  appSpecPathPlaceholder: string;
  catalogId: string;
  draftAssets: string;
  draftAssetsError: string | null;
  draftTheme: string;
  draftThemeError: string | null;
  onAppSpecPathChange: (value: string) => void;
  onCatalogIdChange: (value: string) => void;
  onDraftAssetsChange: (value: string) => void;
  onDraftThemeChange: (value: string) => void;
  onPreviewConfigIdChange: (value: string | null) => void;
  onSpecVersionChange: (value: string) => void;
  onThemeModeChange: (value: AppThemeMode) => void;
  previewConfigId: string | null;
  projectMetadata: ProjectMetadataOption[];
  specVersion: string;
  themeMode: AppThemeMode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3">
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.catalog_id"
        >
          Catalog ID
          <input
            aria-label="Catalog ID"
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={catalogId}
            onChange={(event) => onCatalogIdChange(event.target.value)}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.spec_version"
        >
          Spec version
          <input
            aria-label="Spec version"
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={specVersion}
            onChange={(event) => onSpecVersionChange(event.target.value)}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.theme_mode"
        >
          Theme mode
          <select
            aria-label="Theme mode"
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={themeMode}
            onChange={(event) =>
              onThemeModeChange(event.target.value as AppThemeMode)
            }
          >
            <option value="auto">auto</option>
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
          <span className="text-[11px] text-setta-500 dark:text-setta-400">
            App deployments default to auto. Force dark or light here, then
            republish.
          </span>
        </label>
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.spec_path"
        >
          Spec path
          <input
            aria-label="Spec path"
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            placeholder={appSpecPathPlaceholder}
            value={appSpecPath}
            onChange={(event) => onAppSpecPathChange(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Preview config
          <select
            aria-label="Preview config"
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={previewConfigId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onPreviewConfigIdChange(value ? value : null);
            }}
          >
            <option value="">Active config</option>
            {projectMetadata.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-setta-500 dark:text-setta-400">
            Select which project config the preview should target.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-setta-500 dark:text-setta-400">
          <span>Theme JSON</span>
          <span className="ml-2 text-[11px]">
            Advanced styling can be set via <code>vars</code> (keys must start
            with <code>--app-</code>).
          </span>
        </div>
        <textarea
          aria-label="Theme JSON"
          className="min-h-[160px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder='{"mode":"dark","vars":{"--app-accent":"#ff006e"}}'
          value={draftTheme}
          onChange={(event) => onDraftThemeChange(event.target.value)}
        />
        {draftThemeError ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
          >
            {draftThemeError}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-setta-500 dark:text-setta-400">
          <span>Assets JSON</span>
          <span className="ml-2 text-[11px]">
            Links are injected as <code>&lt;link&gt;</code> tags. External URLs
            are gated by the deployment policy.
          </span>
        </div>
        <textarea
          aria-label="Assets JSON"
          className="min-h-[120px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder='[{"rel":"stylesheet","href":"/static/app.css"}]'
          value={draftAssets}
          onChange={(event) => onDraftAssetsChange(event.target.value)}
        />
        {draftAssetsError ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
          >
            {draftAssetsError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
