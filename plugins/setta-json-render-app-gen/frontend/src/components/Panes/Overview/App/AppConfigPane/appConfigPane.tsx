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
} from "../../../../ui/PaneAccordion";

import { useAppPreview } from "../../../../../appSubsystemProjectState";

import { useAppDefinition } from "../../../../../appSubsystemDefinitionState";

import {
  useAppSubsystemFrontendHost,
  useAppSubsystemProjectContext,
} from "../../../../../appSubsystemFrontendHostContext";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { type AppDefinition } from "../../../../../appSubsystemContracts";

import { getRegisteredAppSubsystemPluginId } from "../../../../../appSubsystemPluginHost";

import {
  parseDraftAppAssets,
  parseDraftAppSpec,
  parseDraftAppSpecPayload,
  parseDraftAppTheme,
  type AppThemeMode,
  type AppSpecDraftPayload,
} from "../appDraftPreview";

import {
  ADVANCED_ACCORDION_TRIGGER_DISABLED_CLASSES,
  ADVANCED_ACCORDION_TRIGGER_ENABLED_CLASSES,
  AppConfigAdvancedContent,
  AppConfigToolbar,
  DEFAULT_CATALOG_ID,
  DEFAULT_SPEC_VERSION,
  DEFAULT_THEME_MODE,
  DraftSpecEditor,
  ErrorMessageBanner,
  HydratedAppDefinition,
  HydratedAppDraftState,
  NormalizedAppDefinitionValidationResult,
  ParsedAppDefinitionRequest,
  ProjectMetadataOption,
  ValidationResultPanel,
  buildAppDefinitionRequest,
  buildDefaultSpec,
  buildElementIndex,
  buildHydratedAppDraftState,
  buildHydratedAppMetadata,
  buildHydratedPreviewState,
  buildValidationSuccessMessage,
  formatOptionalJson,
  isRecord,
  normalizeValidationResult,
  parseAssetsPayloadForRequest,
  parseThemePayloadForRequest,
  resolveThemeMode,
  trimOptionalInput,
} from "./appConfigDraft";

/** @lintignore Consumed by the app subsystem plugin frontend. */
export function AppConfigPane() {
  const frontendHost = useAppSubsystemFrontendHost();
  const { projectConfig, projectMetadata } = useAppSubsystemProjectContext();
  const projectConfigId = projectConfig.id;
  const appSubsystemPluginID = getRegisteredAppSubsystemPluginId();
  const appSpec = useAppDefinition((state) => state.appSpec);
  const isPreviewEnabled = useAppPreview((state) => state.isPreviewEnabled);
  const previewConfigId = useAppPreview((state) => state.previewConfigId);
  const draftSpecRef = useRef<HTMLTextAreaElement | null>(null);
  const [draftSpec, setDraftSpec] = useState("");
  const [draftSpecPreviewText, setDraftSpecPreviewText] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [draftTheme, setDraftTheme] = useState("");
  const [draftAssets, setDraftAssets] = useState("");
  const [draftSpecError, setDraftSpecError] = useState<string | null>(null);
  const [draftThemeError, setDraftThemeError] = useState<string | null>(null);
  const [draftAssetsError, setDraftAssetsError] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState(DEFAULT_CATALOG_ID);
  const [specVersion, setSpecVersion] = useState(DEFAULT_SPEC_VERSION);
  const [appSpecPath, setAppSpecPath] = useState("");
  const [themeMode, setThemeMode] = useState<AppThemeMode>(DEFAULT_THEME_MODE);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<NormalizedAppDefinitionValidationResult | null>(null);
  const deferredDraftSpec = useDeferredValue(draftSpecPreviewText);
  const deferredDraftTheme = useDeferredValue(draftTheme);
  const deferredDraftAssets = useDeferredValue(draftAssets);
  const defaultAppSpecPath = buildDefaultAppSpecPath(appSubsystemPluginID);
  const appSpecPathPlaceholder =
    defaultAppSpecPath || "plugins/<app-provider>/app_specs/app.json";
  const readDraftSpec = useCallback(() => {
    return draftSpecRef.current?.value ?? draftSpec;
  }, [draftSpec]);
  const writeDraftSpec = useCallback((nextDraftSpec: string) => {
    if (draftSpecRef.current && draftSpecRef.current.value !== nextDraftSpec) {
      draftSpecRef.current.value = nextDraftSpec;
    }
    setDraftSpec(nextDraftSpec);
    setDraftSpecPreviewText(nextDraftSpec);
    setHasDraft(nextDraftSpec.trim().length > 0);
  }, []);
  const clearDraftErrors = useCallback(() => {
    setDraftSpecError(null);
    setDraftThemeError(null);
    setDraftAssetsError(null);
  }, []);
  const clearPreviewOverrides = useCallback(() => {
    useAppPreview.setState({
      previewSpecOverride: undefined,
      aiPreviewSpecOverride: undefined,
      previewThemeOverride: undefined,
      previewAssetsOverride: undefined,
    });
  }, []);
  const applyHydratedAppDraftState = useCallback(
    (hydratedState: HydratedAppDraftState) => {
      writeDraftSpec(hydratedState.draftSpec);
      setCatalogId(hydratedState.catalogId);
      setSpecVersion(hydratedState.specVersion);
      setAppSpecPath(hydratedState.appSpecPath);
      setDraftTheme(hydratedState.draftTheme);
      setDraftAssets(hydratedState.draftAssets);
      setThemeMode(hydratedState.themeMode);
    },
    [writeDraftSpec],
  );
  const loadSavedAppDefinition = useCallback(
    (savedAppDefinition: HydratedAppDefinition) => {
      const hydratedState = buildHydratedAppDraftState(savedAppDefinition);
      useAppDefinition.setState({
        appSpec: hydratedState.appSpec,
        appDefinition: hydratedState.appDefinition,
      });
      applyHydratedAppDraftState(hydratedState);
    },
    [applyHydratedAppDraftState],
  );
  const hydrateSavedAppDefinition = useCallback(
    (savedAppDefinition: HydratedAppDefinition) => {
      const hydratedState = buildHydratedAppDraftState(savedAppDefinition);
      useAppDefinition.setState({
        appSpec: hydratedState.appSpec,
        appDefinition: hydratedState.appDefinition,
      });
      applyHydratedAppDraftState(hydratedState);
      useAppPreview.setState({
        previewSpecOverride: hydratedState.previewSpecOverride,
        previewThemeOverride: hydratedState.previewThemeOverride,
        previewAssetsOverride: hydratedState.previewAssetsOverride,
      });
      clearDraftErrors();
    },
    [applyHydratedAppDraftState, clearDraftErrors],
  );
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!projectConfigId) {
        return;
      }
      clearPreviewOverrides();
      clearDraftErrors();
      setLoading(true);
      setErrorMessage(null);
      const response = await callOpenAPI(
        getAppDefinition({ body: {} } as Parameters<
          typeof getAppDefinition
        >[0]),
      );
      setLoading(false);
      if (!res200(response)) {
        if (isMounted) {
          const detail = getErrorDetail(response.data);
          setErrorMessage(detail ?? "Failed to load app spec.");
        }
        return;
      }
      if (!isMounted) {
        return;
      }
      loadSavedAppDefinition({
        savedSpec: response.data.appSpec ?? null,
        savedDefinition: response.data.appDefinition ?? null,
      });
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [
    clearDraftErrors,
    clearPreviewOverrides,
    loadSavedAppDefinition,
    projectConfigId,
  ]);
  const applyDraftSpecPreview = useCallback((nextDraftSpec: string) => {
    if (nextDraftSpec.trim().length === 0) {
      setDraftSpecError(null);
      useAppPreview.setState({ previewSpecOverride: undefined });
      return;
    }
    const parsed = parseDraftAppSpec(nextDraftSpec);
    if (parsed.ok) {
      setDraftSpecError(null);
      useAppPreview.setState({ previewSpecOverride: parsed.value });
      return;
    }
    setDraftSpecError(parsed.error);
  }, []);
  const applyDraftThemePreview = useCallback(
    (nextDraftTheme: string, nextThemeMode: AppThemeMode) => {
      const parsed = parseDraftAppTheme(nextDraftTheme, nextThemeMode);
      if (parsed.ok) {
        setDraftThemeError(null);
        useAppPreview.setState({ previewThemeOverride: parsed.value });
        return;
      }
      setDraftThemeError(parsed.error);
      const previousTheme = useAppPreview.getState().previewThemeOverride;
      useAppPreview.setState({
        previewThemeOverride: isRecord(previousTheme)
          ? { ...previousTheme, mode: nextThemeMode }
          : { mode: nextThemeMode },
      });
    },
    [],
  );
  const applyDraftAssetsPreview = useCallback((nextDraftAssets: string) => {
    const parsed = parseDraftAppAssets(nextDraftAssets);
    if (parsed.ok) {
      setDraftAssetsError(null);
      useAppPreview.setState({ previewAssetsOverride: parsed.value });
      return;
    }
    setDraftAssetsError(parsed.error);
  }, []);
  useEffect(() => {
    if (!isPreviewEnabled) {
      return;
    }
    const timeoutId = setTimeout(() => {
      applyDraftSpecPreview(deferredDraftSpec);
    }, 300);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [applyDraftSpecPreview, deferredDraftSpec, isPreviewEnabled]);
  useEffect(() => {
    if (!isPreviewEnabled) {
      return;
    }
    const timeoutId = setTimeout(() => {
      applyDraftThemePreview(deferredDraftTheme, themeMode);
    }, 300);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [applyDraftThemePreview, deferredDraftTheme, isPreviewEnabled, themeMode]);
  useEffect(() => {
    if (!isPreviewEnabled) {
      return;
    }
    const timeoutId = setTimeout(() => {
      applyDraftAssetsPreview(deferredDraftAssets);
    }, 300);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [applyDraftAssetsPreview, deferredDraftAssets, isPreviewEnabled]);
  const saveAndHydrateAppDefinition = useCallback(
    async ({
      appSpec: nextSpec,
      failureMessage,
      withLoading,
    }: {
      appSpec: AppSpecDraftPayload;
      failureMessage: string;
      withLoading: boolean;
    }): Promise<boolean> => {
      const request = buildAppDefinitionRequest({
        appSpecPath,
        catalogId,
        draftAssets,
        draftTheme,
        specVersion,
        themeMode,
      });
      if (!request.ok) {
        setErrorMessage(request.error);
        return false;
      }
      if (withLoading) {
        setLoading(true);
      }
      const response = await callOpenAPI(
        setAppDefinition({
          body: {
            appSpec: nextSpec,
            ...request.value,
          },
        } as Parameters<typeof setAppDefinition>[0]),
      );
      if (withLoading) {
        setLoading(false);
      }
      if (!res200(response)) {
        const detail = getErrorDetail(response.data);
        setErrorMessage(detail ?? failureMessage);
        return false;
      }
      hydrateSavedAppDefinition({
        savedSpec: response.data.appSpec ?? null,
        savedDefinition: response.data.appDefinition ?? null,
      });
      return true;
    },
    [
      appSpecPath,
      catalogId,
      draftAssets,
      draftTheme,
      hydrateSavedAppDefinition,
      specVersion,
      themeMode,
    ],
  );
  function handleCreateDefault() {
    const spec = buildDefaultSpec();
    writeDraftSpec(JSON.stringify(spec, null, 2));
    if (!appSpecPath && defaultAppSpecPath) {
      setAppSpecPath(defaultAppSpecPath);
    }
  }
  async function handleSave() {
    setErrorMessage(null);
    const specPayload = parseDraftAppSpecPayload(readDraftSpec());
    if (!specPayload.ok) {
      setErrorMessage(specPayload.error);
      return;
    }
    const saved = await saveAndHydrateAppDefinition({
      appSpec: specPayload.value,
      failureMessage: "Failed to save app spec.",
      withLoading: true,
    });
    if (!saved) {
      return;
    }
    frontendHost.notify({ message: "App spec saved." });
  }
  async function handleValidate() {
    setErrorMessage(null);
    setValidationResult(null);
    const specPayload = parseDraftAppSpecPayload(readDraftSpec());
    if (!specPayload.ok) {
      setErrorMessage(specPayload.error);
      return;
    }
    const request = buildAppDefinitionRequest({
      appSpecPath,
      catalogId,
      draftAssets,
      draftTheme,
      specVersion,
      themeMode,
    });
    if (!request.ok) {
      setErrorMessage(request.error);
      return;
    }
    setValidating(true);
    const response = await callOpenAPI(
      validateAppDefinition({
        body: {
          appSpec: specPayload.value,
          appSpecVersion: request.value.appSpecVersion,
          catalogId: request.value.catalogId,
          theme: request.value.theme,
          assets: request.value.assets,
        },
      } as Parameters<typeof validateAppDefinition>[0]),
    );
    setValidating(false);
    if (!res200(response)) {
      const detail = getErrorDetail(response.data);
      setErrorMessage(detail ?? "Failed to validate app spec.");
      return;
    }
    const normalizedResult = normalizeValidationResult(response.data);
    setValidationResult(normalizedResult);
    if (normalizedResult.errors.length === 0) {
      frontendHost.notify({
        message: buildValidationSuccessMessage(
          normalizedResult.warnings.length,
        ),
      });
    }
  }
  const handleTogglePreview = useCallback(() => {
    const nextPreviewEnabled = !useAppPreview.getState().isPreviewEnabled;
    const nextDraftSpec = readDraftSpec();
    if (nextPreviewEnabled) {
      setDraftSpecPreviewText(nextDraftSpec);
      applyDraftSpecPreview(nextDraftSpec);
      applyDraftThemePreview(draftTheme, themeMode);
      applyDraftAssetsPreview(draftAssets);
    }
    useAppPreview.setState({ isPreviewEnabled: nextPreviewEnabled });
  }, [
    applyDraftAssetsPreview,
    applyDraftSpecPreview,
    applyDraftThemePreview,
    draftAssets,
    draftTheme,
    readDraftSpec,
    themeMode,
  ]);
  const handleDraftSpecChange = useCallback((value: string) => {
    setHasDraft(value.trim().length > 0);
    setDraftSpecError((current) => (current === null ? current : null));
    setValidationResult((current) => (current === null ? current : null));
    if (useAppPreview.getState().isPreviewEnabled) {
      setDraftSpecPreviewText(value);
    }
  }, []);
  const handleDraftThemeChange = useCallback((value: string) => {
    setDraftTheme(value);
    setDraftThemeError(null);
    setValidationResult(null);
  }, []);
  const handleDraftAssetsChange = useCallback((value: string) => {
    setDraftAssets(value);
    setDraftAssetsError(null);
    setValidationResult(null);
  }, []);
  const handlePreviewConfigIdChange = useCallback((value: string | null) => {
    useAppPreview.setState({
      previewConfigId: value,
    });
  }, []);
  return (
    <section className="setta-pane-scroll flex min-h-0 flex-1 flex-col gap-4 pb-4 text-sm text-setta-600 dark:text-setta-300">
      <AppConfigToolbar
        hasDraft={hasDraft}
        isPreviewEnabled={isPreviewEnabled}
        loading={loading}
        onCreateDefault={handleCreateDefault}
        onSave={() => {
          void handleSave();
        }}
        onTogglePreview={handleTogglePreview}
        onValidate={() => {
          void handleValidate();
        }}
        validating={validating}
      />

      <ErrorMessageBanner message={errorMessage} />

      <ValidationResultPanel result={validationResult} />

      <DraftSpecEditor
        appSpec={appSpec}
        draftSpec={draftSpec}
        draftSpecError={draftSpecError}
        draftSpecRef={draftSpecRef}
        onDraftSpecChange={handleDraftSpecChange}
      />

      <PaneAccordion
        items={
          [
            {
              value: "advanced",
              title: "Advanced",
              description: "Theme, assets, preview targeting, and metadata.",
              triggerTestId: "app-config-advanced-accordion",
              content: (
                <AppConfigAdvancedContent
                  appSpecPath={appSpecPath}
                  appSpecPathPlaceholder={appSpecPathPlaceholder}
                  catalogId={catalogId}
                  draftAssets={draftAssets}
                  draftAssetsError={draftAssetsError}
                  draftTheme={draftTheme}
                  draftThemeError={draftThemeError}
                  onAppSpecPathChange={setAppSpecPath}
                  onCatalogIdChange={setCatalogId}
                  onDraftAssetsChange={handleDraftAssetsChange}
                  onDraftThemeChange={handleDraftThemeChange}
                  onPreviewConfigIdChange={handlePreviewConfigIdChange}
                  onSpecVersionChange={setSpecVersion}
                  onThemeModeChange={setThemeMode}
                  previewConfigId={previewConfigId}
                  projectMetadata={projectMetadata as ProjectMetadataOption[]}
                  specVersion={specVersion}
                  themeMode={themeMode}
                />
              ),
            },
          ] satisfies Array<PaneAccordionItem>
        }
        openValues={showAdvanced ? ["advanced"] : []}
        onOpenValuesChange={(openValues) =>
          setShowAdvanced(openValues.includes("advanced"))
        }
        enabledTriggerClassName={ADVANCED_ACCORDION_TRIGGER_ENABLED_CLASSES}
        disabledTriggerClassName={ADVANCED_ACCORDION_TRIGGER_DISABLED_CLASSES}
        chevronClassName="app-config-advanced-chevron"
      />
    </section>
  );
}
