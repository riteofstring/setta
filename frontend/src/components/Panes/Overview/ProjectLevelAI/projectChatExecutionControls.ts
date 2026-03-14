import {
  createManagedExecutionControlHandlers,
  type ChatPermissionModeValue,
} from "components/Chat/chatComposerControls";
import { useEffect, useMemo, useState } from "react";
import { EngineTypeEnum } from "utils/generatedTypes";
import { getDefaultProjectChatPermissionMode } from "./projectChatRuntimeUtils";

export function resolveProjectChatPermissionModeForEngine({
  currentPermissionMode,
  isExternalEngine,
}: {
  currentPermissionMode: ChatPermissionModeValue;
  isExternalEngine: boolean;
}): ChatPermissionModeValue {
  if (!isExternalEngine && currentPermissionMode === "config_toml_custom") {
    return getDefaultProjectChatPermissionMode(EngineTypeEnum.setta_llm);
  }
  if (isExternalEngine && currentPermissionMode === "minimal") {
    return "config_toml_custom";
  }
  return currentPermissionMode;
}

export function resolveProjectChatExecutionControlVisibility({
  engineConfigId,
  isExternalEngine,
  externalEngineAvailable,
  hasLLMConfig,
}: {
  engineConfigId: string | null;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
}) {
  const canConfigureExecutionSettings =
    Boolean(engineConfigId) &&
    (isExternalEngine ? externalEngineAvailable : hasLLMConfig);

  return {
    canConfigureExecutionSettings,
    showPermissionExecutionControl: canConfigureExecutionSettings,
    showSearchExecutionControl: false,
  };
}

export function useProjectChatExecutionControls({
  engineType,
  engineConfigId,
  isExternalEngine,
  externalEngineAvailable,
  hasLLMConfig,
  onPermissionModeChange,
}: {
  engineType: EngineTypeEnum | null;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  onPermissionModeChange?: (
    nextPermissionMode: ChatPermissionModeValue,
  ) => void;
}) {
  const [executionSettings, setExecutionSettings] = useState(() => ({
    permissionMode: getDefaultProjectChatPermissionMode(engineType),
    searchEnabled: true,
  }));

  useEffect(() => {
    setExecutionSettings((current) => {
      const nextPermissionMode = resolveProjectChatPermissionModeForEngine({
        currentPermissionMode: current.permissionMode,
        isExternalEngine,
      });
      if (nextPermissionMode === current.permissionMode) {
        return current;
      }
      return {
        permissionMode: nextPermissionMode,
        searchEnabled: current.searchEnabled,
      };
    });
  }, [isExternalEngine]);

  useEffect(() => {
    if (!onPermissionModeChange) {
      return;
    }
    onPermissionModeChange(executionSettings.permissionMode);
  }, [executionSettings.permissionMode, onPermissionModeChange]);

  const executionControlHandlers = useMemo(
    () => createManagedExecutionControlHandlers(setExecutionSettings),
    [],
  );

  return {
    executionSettings,
    executionControlHandlers,
    ...resolveProjectChatExecutionControlVisibility({
      engineConfigId,
      isExternalEngine,
      externalEngineAvailable,
      hasLLMConfig,
    }),
  };
}
