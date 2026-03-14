import type { Spec } from "@json-render/core";
import { useCallback, useEffect, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  type AppDefinition,
  type ValidateAppDefinitionResponse,
} from "utils/generatedTypes";
import {
  loadAppConfigDefinition,
  saveAppConfigDefinition,
  validateAppConfigDefinition,
} from "./appConfigApi";
import {
  parseAssetsPayloadForRequest,
  parseSpecPayloadForRequest,
  parseThemePayloadForRequest,
  type AppSpecPayload,
} from "./appConfigDefinitionUtils";
import { type AppThemeMode } from "./appDraftPreview";
import { resetAppConfigPreviewOverrides } from "./useAppConfigDefinitionDrafts";

type HydrateSavedAppDefinitionArgs = {
  savedSpec: unknown;
  savedDefinition: AppDefinition | null;
};

export type UseAppConfigPersistenceArgs = {
  projectConfigId: string;
  appSpecPath: string;
  catalogId: string;
  clearDraftErrors: () => void;
  draftAssets: string;
  draftSpec: string;
  draftTheme: string;
  hydrateSavedAppDefinition: (args: HydrateSavedAppDefinitionArgs) => void;
  specVersion: string;
  themeMode: AppThemeMode;
};

export function useAppConfigPersistence({
  projectConfigId,
  appSpecPath,
  catalogId,
  clearDraftErrors,
  draftAssets,
  draftSpec,
  draftTheme,
  hydrateSavedAppDefinition,
  specVersion,
  themeMode,
}: UseAppConfigPersistenceArgs) {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidateAppDefinitionResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!projectConfigId) {
        return;
      }
      resetAppConfigPreviewOverrides();
      clearDraftErrors();
      setLoading(true);
      setErrorMessage(null);
      const res = await loadAppConfigDefinition();
      if (!isMounted) {
        return;
      }
      setLoading(false);
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }
      hydrateSavedAppDefinition({
        savedSpec: res.value.appSpec,
        savedDefinition: res.value.appDefinition,
      });
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [clearDraftErrors, hydrateSavedAppDefinition, projectConfigId]);

  const saveAndHydrateAppDefinition = useCallback(
    async ({
      appSpec: nextSpec,
      failureMessage,
      withLoading,
    }: {
      appSpec: AppSpecPayload;
      failureMessage: string;
      withLoading: boolean;
    }): Promise<boolean> => {
      const themePayload = parseThemePayloadForRequest({
        draftTheme,
        themeMode,
      });
      if (!themePayload.ok) {
        setErrorMessage(themePayload.error);
        return false;
      }
      const assetsPayload = parseAssetsPayloadForRequest(draftAssets);
      if (!assetsPayload.ok) {
        setErrorMessage(assetsPayload.error);
        return false;
      }
      if (withLoading) {
        setLoading(true);
      }
      const res = await saveAppConfigDefinition(
        {
          appSpec: nextSpec,
          appSpecPath: appSpecPath.trim() ? appSpecPath.trim() : undefined,
          appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
          catalogId: catalogId.trim() ? catalogId.trim() : undefined,
          theme: themePayload.value,
          assets: assetsPayload.value,
        },
        failureMessage,
      );
      if (withLoading) {
        setLoading(false);
      }
      if (!res.ok) {
        setErrorMessage(res.error);
        return false;
      }
      hydrateSavedAppDefinition({
        savedSpec: res.value.appSpec,
        savedDefinition: res.value.appDefinition,
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

  const persistGeneratedSpec = useCallback(
    async (spec: Spec): Promise<boolean> => {
      return saveAndHydrateAppDefinition({
        appSpec: spec as unknown as AppSpecPayload,
        failureMessage: "Failed to save generated app spec.",
        withLoading: false,
      });
    },
    [saveAndHydrateAppDefinition],
  );

  const handleSave = useCallback(async () => {
    setErrorMessage(null);
    const specPayload = parseSpecPayloadForRequest(draftSpec);
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
    addTemporaryNotification("App spec saved.");
  }, [draftSpec, saveAndHydrateAppDefinition]);

  const handleValidate = useCallback(async () => {
    setErrorMessage(null);
    setValidationResult(null);
    const specPayload = parseSpecPayloadForRequest(draftSpec);
    if (!specPayload.ok) {
      setErrorMessage(specPayload.error);
      return;
    }
    const themePayload = parseThemePayloadForRequest({
      draftTheme,
      themeMode,
    });
    if (!themePayload.ok) {
      setErrorMessage(themePayload.error);
      return;
    }
    const assetsPayload = parseAssetsPayloadForRequest(draftAssets);
    if (!assetsPayload.ok) {
      setErrorMessage(assetsPayload.error);
      return;
    }

    setValidating(true);
    const res = await validateAppConfigDefinition({
      appSpec: specPayload.value,
      appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
      catalogId: catalogId.trim() ? catalogId.trim() : undefined,
      theme: themePayload.value,
      assets: assetsPayload.value,
    });
    setValidating(false);
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    setValidationResult(res.value);
    if (res.value.errors.length === 0) {
      addTemporaryNotification(
        res.value.warnings.length > 0
          ? `Validation passed with ${res.value.warnings.length} warning(s).`
          : "Validation passed.",
      );
    }
  }, [catalogId, draftAssets, draftSpec, draftTheme, specVersion, themeMode]);

  return {
    errorMessage,
    handleSave,
    handleValidate,
    loading,
    persistGeneratedSpec,
    setErrorMessage,
    validationResult,
    validating,
  };
}
