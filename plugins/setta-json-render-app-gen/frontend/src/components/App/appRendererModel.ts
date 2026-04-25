import {
  resolveAppPolicy,
  resolveMainRunRequest,
  type Policy,
} from "@setta/app-subsystem-frontend-sdk";
import { useMemo, useState } from "react";
import { useAppConfigs } from "../../appSubsystemProjectState";
import type { AppDefinition } from "../../appSubsystemContracts";
import { useAppSubsystemRuntimeContext } from "../../appSubsystemFrontendHostContext";
import {
  resolveAppRunState,
  useAppActionHandlers,
  type AppActionHandler,
} from "./appActionHandlers";
import { normalizeActionDefinitions } from "./appBindings";
import { normalizeAppSpec } from "./appSpec";
import { resolveAppTheme } from "./appTheme";

type AppRendererModelArgs = {
  appSpec: unknown | null;
  appDefinition: AppDefinition | null | undefined;
  appPolicy?: Policy | null;
  defaultConfigId?: string | null;
  rootKeyOverride?: string | null;
};

type AppRendererPolicyState = {
  allowMultipleRuns: boolean;
  canRun: boolean;
  runDisabledReason: string | null;
  canEditParams: boolean;
  allowExternalLinks: boolean;
  allowFileDownloads: boolean;
};

type AppRendererModel = {
  spec: ReturnType<typeof normalizeAppSpec>;
  resolvedPolicy: Policy;
  resolvedTheme: ReturnType<typeof resolveAppTheme>;
  actionDefinitions: ReturnType<typeof normalizeActionDefinitions>;
  actionHandlers: Record<string, AppActionHandler>;
  canRun: boolean;
  runDisabledReason: string | null;
  isRunning: boolean;
  canEditParams: boolean;
  allowExternalLinks: boolean;
  allowFileDownloads: boolean;
  fallbackConfigId: string | null;
  dataBindings: Record<string, unknown>;
};

function selectLoadedDefaultRunRequest(
  configId: string | null,
  configs: ReturnType<typeof useAppConfigs.getState>["configs"],
) {
  if (!configId) {
    return null;
  }
  const configState = configs[configId] ?? null;
  if (!configState) {
    return null;
  }
  return resolveMainRunRequest(configState);
}

function resolveRendererPolicyState(args: {
  resolvedPolicy: Policy;
  deploymentMode: boolean;
  sessionRunCount: number;
  localRunCount: number;
  loadedDefaultRunRequest: ReturnType<typeof resolveMainRunRequest> | null;
}): AppRendererPolicyState {
  const allowMultipleRuns = args.resolvedPolicy.allowMultipleRuns ?? true;
  const effectiveRunCount = args.deploymentMode
    ? args.sessionRunCount
    : args.localRunCount;
  const { canRun, runDisabledReason } = resolveAppRunState({
    allowRun: args.resolvedPolicy.allowRun,
    allowMultipleRuns,
    effectiveRunCount,
    loadedDefaultRunRequest: args.loadedDefaultRunRequest,
  });
  return {
    allowMultipleRuns,
    canRun,
    runDisabledReason,
    canEditParams: args.resolvedPolicy.allowParamChanges ?? true,
    allowExternalLinks: args.resolvedPolicy.allowExternalLinks ?? false,
    allowFileDownloads: args.resolvedPolicy.allowFileDownloads ?? false,
  };
}

export function useAppRendererModel(
  args: AppRendererModelArgs,
): AppRendererModel {
  const fallbackConfigId = args.defaultConfigId ?? null;
  const { isAppDeploymentMode, sessionRunCount, sharePolicy } =
    useAppSubsystemRuntimeContext();
  const deploymentMode = isAppDeploymentMode;
  const resolvedPolicy = resolveAppPolicy(args.appPolicy ?? sharePolicy);
  const resolvedTheme = useMemo(
    () => resolveAppTheme(args.appDefinition?.theme),
    [args.appDefinition?.theme],
  );
  const spec = useMemo(
    () => normalizeAppSpec(args.appSpec, args.rootKeyOverride),
    [args.appSpec, args.rootKeyOverride],
  );
  const actionDefinitions = useMemo(
    () => normalizeActionDefinitions(args.appDefinition?.actions),
    [args.appDefinition?.actions],
  );
  const [localRunCount, setLocalRunCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const loadedDefaultRunRequest = useAppConfigs((state) =>
    selectLoadedDefaultRunRequest(fallbackConfigId, state.configs),
  );
  const policyState = useMemo(
    () =>
      resolveRendererPolicyState({
        resolvedPolicy,
        deploymentMode,
        sessionRunCount,
        localRunCount,
        loadedDefaultRunRequest,
      }),
    [
      deploymentMode,
      loadedDefaultRunRequest,
      localRunCount,
      resolvedPolicy,
      sessionRunCount,
    ],
  );
  const actionHandlers = useAppActionHandlers({
    actionDefinitions,
    fallbackConfigId,
    allowFileDownloads: policyState.allowFileDownloads,
    allowExternalLinks: policyState.allowExternalLinks,
    allowRun: resolvedPolicy.allowRun,
    allowParamChanges: resolvedPolicy.allowParamChanges,
    allowVariantChanges: resolvedPolicy.allowVariantChanges,
    allowMultipleRuns: policyState.allowMultipleRuns,
    effectiveRunCount: deploymentMode ? sessionRunCount : localRunCount,
    deploymentMode,
    isRunning,
    setIsRunning,
    setLocalRunCount,
  });
  return {
    spec,
    resolvedPolicy,
    resolvedTheme,
    actionDefinitions,
    actionHandlers,
    canRun: policyState.canRun,
    runDisabledReason: policyState.runDisabledReason,
    isRunning,
    canEditParams: policyState.canEditParams,
    allowExternalLinks: policyState.allowExternalLinks,
    allowFileDownloads: policyState.allowFileDownloads,
    fallbackConfigId,
    dataBindings: args.appDefinition?.dataBindings ?? {},
  };
}
