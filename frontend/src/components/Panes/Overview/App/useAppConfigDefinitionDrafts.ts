import { useCallback, useEffect, useState } from "react";
import { useAppDefinition, useAppPreview } from "state/definitions";
import { type AppDefinition } from "utils/generatedTypes";
import {
  DEFAULT_CATALOG_ID,
  DEFAULT_SPEC_VERSION,
  DEFAULT_THEME_MODE,
  resolveThemeMode,
} from "./appConfigDefinitionUtils";
import {
  parseDraftAppAssets,
  parseDraftAppSpec,
  parseDraftAppTheme,
  type AppThemeMode,
} from "./appDraftPreview";

export type HydratedAppConfigDefinitionDraftState = {
  draftSpec: string;
  catalogId: string;
  specVersion: string;
  appSpecPath: string;
  draftTheme: string;
  draftAssets: string;
  themeMode: AppThemeMode;
  previewSpecOverride: Record<string, unknown> | null;
  previewThemeOverride: AppDefinition["theme"] | null;
  previewAssetsOverride: AppDefinition["assets"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildHydratedAppConfigDefinitionDraftState({
  savedSpec,
  savedDefinition,
}: {
  savedSpec: unknown;
  savedDefinition: AppDefinition | null;
}): HydratedAppConfigDefinitionDraftState {
  const savedTheme = savedDefinition?.theme ?? null;
  const savedAssets = savedDefinition?.assets ?? [];
  return {
    draftSpec: savedSpec ? JSON.stringify(savedSpec, null, 2) : "",
    catalogId: savedDefinition?.catalogId ?? DEFAULT_CATALOG_ID,
    specVersion: savedDefinition?.appSpecVersion ?? DEFAULT_SPEC_VERSION,
    appSpecPath: savedDefinition?.appSpecPath ?? "",
    draftTheme: savedTheme ? JSON.stringify(savedTheme, null, 2) : "",
    draftAssets: JSON.stringify(savedAssets, null, 2),
    themeMode: resolveThemeMode(savedTheme),
    previewSpecOverride: isRecord(savedSpec) ? savedSpec : null,
    previewThemeOverride: savedTheme,
    previewAssetsOverride: savedAssets,
  };
}

export function resetAppConfigPreviewOverrides() {
  useAppPreview.setState({
    previewSpecOverride: undefined,
    aiPreviewSpecOverride: undefined,
    previewThemeOverride: undefined,
    previewAssetsOverride: undefined,
  });
}

export function useAppConfigDefinitionDrafts() {
  const [draftSpec, setDraftSpec] = useState("");
  const [draftTheme, setDraftTheme] = useState("");
  const [draftAssets, setDraftAssets] = useState("");
  const [draftSpecError, setDraftSpecError] = useState<string | null>(null);
  const [draftThemeError, setDraftThemeError] = useState<string | null>(null);
  const [draftAssetsError, setDraftAssetsError] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState(DEFAULT_CATALOG_ID);
  const [specVersion, setSpecVersion] = useState(DEFAULT_SPEC_VERSION);
  const [appSpecPath, setAppSpecPath] = useState("");
  const [themeMode, setThemeMode] = useState<AppThemeMode>(DEFAULT_THEME_MODE);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (draftSpec.trim().length === 0) {
        setDraftSpecError(null);
        useAppPreview.setState({ previewSpecOverride: undefined });
        return;
      }
      const parsed = parseDraftAppSpec(draftSpec);
      if (parsed.ok) {
        setDraftSpecError(null);
        useAppPreview.setState({ previewSpecOverride: parsed.value });
        return;
      }
      setDraftSpecError(parsed.error);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftSpec]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const parsed = parseDraftAppTheme(draftTheme, themeMode);
      if (parsed.ok) {
        setDraftThemeError(null);
        useAppPreview.setState({ previewThemeOverride: parsed.value });
        return;
      }
      setDraftThemeError(parsed.error);
      const previousTheme = useAppPreview.getState().previewThemeOverride;
      useAppPreview.setState({
        previewThemeOverride: isRecord(previousTheme)
          ? { ...previousTheme, mode: themeMode }
          : { mode: themeMode },
      });
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftTheme, themeMode]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const parsed = parseDraftAppAssets(draftAssets);
      if (parsed.ok) {
        setDraftAssetsError(null);
        useAppPreview.setState({ previewAssetsOverride: parsed.value });
        return;
      }
      setDraftAssetsError(parsed.error);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftAssets]);

  const clearDraftErrors = useCallback(() => {
    setDraftSpecError(null);
    setDraftThemeError(null);
    setDraftAssetsError(null);
  }, []);

  const hydrateSavedAppDefinition = useCallback(
    ({
      savedSpec,
      savedDefinition,
    }: {
      savedSpec: unknown;
      savedDefinition: AppDefinition | null;
    }) => {
      const nextState = buildHydratedAppConfigDefinitionDraftState({
        savedSpec,
        savedDefinition,
      });
      useAppDefinition.setState({
        appSpec: savedSpec,
        appDefinition: savedDefinition,
      });
      setDraftSpec(nextState.draftSpec);
      setCatalogId(nextState.catalogId);
      setSpecVersion(nextState.specVersion);
      setAppSpecPath(nextState.appSpecPath);
      setDraftTheme(nextState.draftTheme);
      setDraftAssets(nextState.draftAssets);
      setThemeMode(nextState.themeMode);
      useAppPreview.setState({
        previewSpecOverride: nextState.previewSpecOverride,
        previewThemeOverride: nextState.previewThemeOverride,
        previewAssetsOverride: nextState.previewAssetsOverride,
      });
      clearDraftErrors();
    },
    [clearDraftErrors],
  );

  return {
    appSpecPath,
    catalogId,
    clearDraftErrors,
    draftAssets,
    draftAssetsError,
    draftSpec,
    draftSpecError,
    draftTheme,
    draftThemeError,
    hydrateSavedAppDefinition,
    setAppSpecPath,
    setCatalogId,
    setDraftAssets,
    setDraftSpec,
    setDraftTheme,
    setSpecVersion,
    setThemeMode,
    specVersion,
    themeMode,
  };
}
