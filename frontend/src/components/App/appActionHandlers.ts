import { getAttachmentDownloadUrl, runCode } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  ensureAppProjectConfigLoaded,
  incrementAppSessionRunCount,
  resetAppDeployment,
} from "state/actions/app";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAppConfigs } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { resolveRunRequest } from "utils/runCapabilities";
import type { AppActionDefinitions } from "./appBindings";
import { resolveActionType } from "./appBindings";
import { buildAppBinaryDownloadUrl } from "./appTransport";

export type AppActionHandler = (
  params?: Record<string, unknown>,
) => void | Promise<void>;

type DefaultRunRequest = {
  canRun: boolean;
  disabledReason?: string | null;
} | null;

type AppConfigState = ReturnType<
  typeof useAppConfigs.getState
>["configs"][string];
type AppActionDefinition = AppActionDefinitions[string];
type PreparedRunParams = {
  configId: string;
  requestedSectionId: string | null;
  paramOverrides: Record<string, string> | null;
  sectionVariantOverrides: Record<string, string> | null;
  hasParamOverrides: boolean;
  hasSectionVariantOverrides: boolean;
};
type PrepareRunParamsResult = {
  value: PreparedRunParams | null;
  error: string | null;
};
type HandlerDependencies = {
  fallbackConfigId: string | null;
  handleRun: AppActionHandler;
  handleReset: () => Promise<void>;
  handleDownloadArtifact: (
    artifactId?: string | null,
    filename?: string | null,
    configId?: string | null,
  ) => Promise<void>;
  handleDownloadBinary: (
    contentId?: string | null,
    filename?: string | null,
  ) => void;
  handleOpenExternalLink: (url?: string | null) => void;
};

export function resolveAppRunState(args: {
  allowRun: boolean;
  allowMultipleRuns: boolean;
  effectiveRunCount: number;
  loadedDefaultRunRequest: DefaultRunRequest;
}): {
  canRun: boolean;
  runDisabledReason: string | null;
} {
  const {
    allowRun,
    allowMultipleRuns,
    effectiveRunCount,
    loadedDefaultRunRequest,
  } = args;
  if (!allowRun) {
    return {
      canRun: false,
      runDisabledReason: "Runs are disabled by policy.",
    };
  }
  if (!allowMultipleRuns && effectiveRunCount > 0) {
    return {
      canRun: false,
      runDisabledReason: "This app is limited to one run.",
    };
  }
  if (loadedDefaultRunRequest && !loadedDefaultRunRequest.canRun) {
    return {
      canRun: false,
      runDisabledReason:
        loadedDefaultRunRequest.disabledReason ?? "Run is unavailable.",
    };
  }
  return { canRun: true, runDisabledReason: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      return null;
    }
    output[key] = entry;
  }
  return output;
}

function resolveParamString(
  params: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = params?.[key];
  return typeof value === "string" ? value : null;
}

function resolveDefinitionString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeOverrideMap(
  raw: unknown,
  errorMessage: string,
): {
  value: Record<string, string> | null;
  error: string | null;
} {
  if (raw === undefined) {
    return { value: null, error: null };
  }
  const value = toStringRecord(raw);
  if (!value) {
    return { value: null, error: errorMessage };
  }
  return { value, error: null };
}

function hasEntries(record: Record<string, string> | null): boolean {
  return Boolean(record && Object.keys(record).length > 0);
}

function prepareRunParams(
  params: Record<string, unknown> | undefined,
  fallbackConfigId: string | null,
): PrepareRunParamsResult {
  const configId = resolveParamString(params, "configId") ?? fallbackConfigId;
  if (!configId) {
    return { value: null, error: "Missing project config for run." };
  }
  const sectionVariantOverrides = normalizeOverrideMap(
    params?.sectionVariantOverrides,
    "Invalid sectionVariantOverrides (expected object of string -> string).",
  );
  if (sectionVariantOverrides.error) {
    return { value: null, error: sectionVariantOverrides.error };
  }
  const paramOverrides = normalizeOverrideMap(
    params?.paramOverrides,
    "Invalid paramOverrides (expected object of string -> string).",
  );
  if (paramOverrides.error) {
    return { value: null, error: paramOverrides.error };
  }
  return {
    value: {
      configId,
      requestedSectionId: resolveParamString(params, "sectionId"),
      paramOverrides: paramOverrides.value,
      sectionVariantOverrides: sectionVariantOverrides.value,
      hasParamOverrides: hasEntries(paramOverrides.value),
      hasSectionVariantOverrides: hasEntries(sectionVariantOverrides.value),
    },
    error: null,
  };
}

function resolveRunPolicyError(
  runParams: PreparedRunParams,
  allowParamChanges: boolean,
  allowVariantChanges: boolean,
): string | null {
  if (runParams.hasSectionVariantOverrides && !allowVariantChanges) {
    return "Variant changes are disabled by policy.";
  }
  if (runParams.hasParamOverrides && !allowParamChanges) {
    return "Param changes are disabled by policy.";
  }
  return null;
}

async function loadConfigState(
  configId: string,
): Promise<AppConfigState | null> {
  const loaded = await ensureAppProjectConfigLoaded(configId);
  if (!loaded) {
    return null;
  }
  return useAppConfigs.getState().configs[configId] ?? null;
}

function buildRunRequestBody(
  runParams: PreparedRunParams,
  executionSectionId: string,
): Parameters<typeof runCode>[0]["body"] {
  return {
    projectConfigId: runParams.configId,
    sectionId: executionSectionId,
    ...(runParams.hasSectionVariantOverrides &&
    runParams.sectionVariantOverrides
      ? { sectionVariantOverrides: runParams.sectionVariantOverrides }
      : {}),
    ...(runParams.hasParamOverrides && runParams.paramOverrides
      ? { paramOverrides: runParams.paramOverrides }
      : {}),
  };
}

async function submitRunRequest(
  runParams: PreparedRunParams,
  executionSectionId: string,
): Promise<boolean> {
  try {
    const res = await callOpenAPI(
      runCode({
        body: buildRunRequestBody(runParams, executionSectionId),
      } as Parameters<typeof runCode>[0]),
    );
    return res200(res);
  } catch {
    return false;
  }
}

async function runWithProgress(
  setIsRunning: Dispatch<SetStateAction<boolean>>,
  action: () => Promise<boolean>,
): Promise<boolean> {
  setIsRunning(true);
  try {
    return await action();
  } finally {
    setIsRunning(false);
  }
}

function recordSuccessfulRun(
  deploymentMode: boolean,
  setLocalRunCount: Dispatch<SetStateAction<number>>,
) {
  if (deploymentMode) {
    incrementAppSessionRunCount();
    return;
  }
  setLocalRunCount((count) => count + 1);
}

function resolveRunStartCheck(args: {
  allowRun: boolean;
  allowMultipleRuns: boolean;
  effectiveRunCount: number;
  isRunning: boolean;
}): {
  notification: string | null;
  shouldContinue: boolean;
} {
  if (!args.allowRun) {
    return {
      notification: "Runs are disabled by policy.",
      shouldContinue: false,
    };
  }
  if (!args.allowMultipleRuns && args.effectiveRunCount > 0) {
    return {
      notification: "This app only allows one run.",
      shouldContinue: false,
    };
  }
  if (args.isRunning) {
    return { notification: null, shouldContinue: false };
  }
  return { notification: null, shouldContinue: true };
}

function createRunHandler(args: {
  fallbackConfigId: string | null;
  allowRun: boolean;
  allowParamChanges: boolean;
  allowVariantChanges: boolean;
  allowMultipleRuns: boolean;
  effectiveRunCount: number;
  deploymentMode: boolean;
  isRunning: boolean;
  setIsRunning: Dispatch<SetStateAction<boolean>>;
  setLocalRunCount: Dispatch<SetStateAction<number>>;
}): AppActionHandler {
  return async (params) => {
    const runStartCheck = resolveRunStartCheck(args);
    if (!runStartCheck.shouldContinue) {
      if (runStartCheck.notification) {
        addTemporaryNotification(runStartCheck.notification);
      }
      return;
    }
    const preparedRun = prepareRunParams(params, args.fallbackConfigId);
    if (!preparedRun.value) {
      addTemporaryNotification(preparedRun.error ?? "Run is unavailable.");
      return;
    }
    const policyError = resolveRunPolicyError(
      preparedRun.value,
      args.allowParamChanges,
      args.allowVariantChanges,
    );
    if (policyError) {
      addTemporaryNotification(policyError);
      return;
    }
    const configState = await loadConfigState(preparedRun.value.configId);
    if (!configState) {
      addTemporaryNotification("Failed to load project config.");
      return;
    }
    const runRequest = resolveRunRequest(
      configState,
      preparedRun.value.requestedSectionId,
    );
    if (!runRequest.canRun) {
      addTemporaryNotification(
        runRequest.disabledReason ?? "Run is unavailable.",
      );
      return;
    }
    const didRun = await runWithProgress(args.setIsRunning, () =>
      submitRunRequest(preparedRun.value, runRequest.executionSectionId),
    );
    if (!didRun) {
      addTemporaryNotification("Run failed.");
      return;
    }
    recordSuccessfulRun(args.deploymentMode, args.setLocalRunCount);
  };
}

function triggerDownload(url: string, filename?: string) {
  if (typeof document === "undefined") {
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  if (filename) {
    anchor.download = filename;
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function requestDownloadUrl(
  artifactId: string,
  projectConfigId: string,
): Promise<string | null> {
  const res = await callOpenAPI(
    getAttachmentDownloadUrl({
      body: {
        artifactId,
        projectConfigId,
      },
    } as Parameters<typeof getAttachmentDownloadUrl>[0]),
  );
  if (!res200(res) || !res.data.url) {
    return null;
  }
  return res.data.url;
}

function createResetHandler(
  sharePolicy: unknown,
  setLocalRunCount: Dispatch<SetStateAction<number>>,
): () => Promise<void> {
  return async () => {
    setLocalRunCount(0);
    if (sharePolicy) {
      await resetAppDeployment();
    }
  };
}

function createDownloadArtifactHandler(args: {
  allowFileDownloads: boolean;
  fallbackConfigId: string | null;
}): (
  artifactId?: string | null,
  filename?: string | null,
  configId?: string | null,
) => Promise<void> {
  return async (artifactId, filename, configId) => {
    if (!args.allowFileDownloads) {
      addTemporaryNotification("File downloads are disabled by policy.");
      return;
    }
    if (!artifactId) {
      addTemporaryNotification("Missing artifact id for download.");
      return;
    }
    const resolvedConfigId = configId ?? args.fallbackConfigId;
    if (!resolvedConfigId) {
      addTemporaryNotification("Missing project config for download.");
      return;
    }
    const url = await requestDownloadUrl(artifactId, resolvedConfigId);
    if (!url) {
      addTemporaryNotification("Failed to start download.");
      return;
    }
    triggerDownload(url, filename ?? undefined);
  };
}

function createDownloadBinaryHandler(args: {
  allowFileDownloads: boolean;
  shareSessionId: string | null;
}): (contentId?: string | null, filename?: string | null) => void {
  return (contentId, filename) => {
    if (!args.allowFileDownloads) {
      addTemporaryNotification("File downloads are disabled by policy.");
      return;
    }
    if (!contentId) {
      addTemporaryNotification("Missing file content id for download.");
      return;
    }
    const url = new URL(
      buildAppBinaryDownloadUrl(contentId, args.shareSessionId),
    );
    triggerDownload(url.toString(), filename ?? undefined);
  };
}

function createOpenExternalLinkHandler(args: {
  allowExternalLinks: boolean;
}): (url?: string | null) => void {
  return (url) => {
    if (!args.allowExternalLinks) {
      addTemporaryNotification("External links are disabled by policy.");
      return;
    }
    if (!url) {
      addTemporaryNotification("Missing link url.");
      return;
    }
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
}

function buildRunActionParams(
  params: Record<string, unknown> | undefined,
  definition: AppActionDefinition,
  fallbackConfigId: string | null,
): Record<string, unknown> {
  const resolvedSectionId =
    resolveParamString(params, "sectionId") ??
    resolveDefinitionString(definition.sectionId);
  const configId =
    resolveParamString(params, "configId") ??
    resolveDefinitionString(definition.configId) ??
    fallbackConfigId;
  const output: Record<string, unknown> = {
    configId: configId ?? undefined,
    paramOverrides: params?.paramOverrides ?? definition.paramOverrides,
    sectionVariantOverrides:
      params?.sectionVariantOverrides ?? definition.sectionVariantOverrides,
  };
  if (resolvedSectionId) {
    output.sectionId = resolvedSectionId;
  }
  return output;
}

function buildDownloadArtifactActionHandler(
  definition: AppActionDefinition,
  dependencies: HandlerDependencies,
): AppActionHandler {
  return (params) =>
    dependencies.handleDownloadArtifact(
      resolveParamString(params, "artifactId") ??
        resolveDefinitionString(definition.artifactId),
      resolveDefinitionString(definition.filename),
      resolveParamString(params, "configId") ??
        resolveDefinitionString(definition.configId) ??
        dependencies.fallbackConfigId,
    );
}

function buildDownloadBinaryActionHandler(
  definition: AppActionDefinition,
  handleDownloadBinary: HandlerDependencies["handleDownloadBinary"],
): AppActionHandler {
  return (params) =>
    handleDownloadBinary(
      resolveParamString(params, "contentId") ??
        resolveDefinitionString(definition.contentId),
      resolveDefinitionString(definition.filename),
    );
}

function buildOpenExternalLinkActionHandler(
  definition: AppActionDefinition,
  handleOpenExternalLink: HandlerDependencies["handleOpenExternalLink"],
): AppActionHandler {
  return (params) =>
    handleOpenExternalLink(
      resolveParamString(params, "url") ??
        resolveDefinitionString(definition.url),
    );
}

function createNamedActionHandler(
  name: string,
  definition: AppActionDefinition,
  dependencies: HandlerDependencies,
): AppActionHandler | null {
  switch (resolveActionType(name, definition)) {
    case "run":
      return (params) =>
        dependencies.handleRun(
          buildRunActionParams(
            params,
            definition,
            dependencies.fallbackConfigId,
          ),
        );
    case "reset":
      return () => dependencies.handleReset();
    case "downloadArtifact":
      return buildDownloadArtifactActionHandler(definition, dependencies);
    case "downloadBinary":
      return buildDownloadBinaryActionHandler(
        definition,
        dependencies.handleDownloadBinary,
      );
    case "openExternalLink":
      return buildOpenExternalLinkActionHandler(
        definition,
        dependencies.handleOpenExternalLink,
      );
    default:
      return null;
  }
}

function buildActionHandlers(
  args: {
    actionDefinitions: AppActionDefinitions;
  } & HandlerDependencies,
): Record<string, AppActionHandler> {
  const handlers: Record<string, AppActionHandler> = {
    run: args.handleRun,
    reset: args.handleReset,
  };
  for (const [name, definition] of Object.entries(args.actionDefinitions)) {
    const handler = createNamedActionHandler(name, definition, args);
    if (handler) {
      handlers[name] = handler;
    }
  }
  return handlers;
}

export function useAppActionHandlers(args: {
  actionDefinitions: AppActionDefinitions;
  fallbackConfigId: string | null;
  shareSessionId: string | null;
  sharePolicy: unknown;
  allowFileDownloads: boolean;
  allowExternalLinks: boolean;
  allowRun: boolean;
  allowParamChanges: boolean;
  allowVariantChanges: boolean;
  allowMultipleRuns: boolean;
  effectiveRunCount: number;
  deploymentMode: boolean;
  isRunning: boolean;
  setIsRunning: Dispatch<SetStateAction<boolean>>;
  setLocalRunCount: Dispatch<SetStateAction<number>>;
}): Record<string, AppActionHandler> {
  const handleRun = useMemo(
    () =>
      createRunHandler({
        fallbackConfigId: args.fallbackConfigId,
        allowRun: args.allowRun,
        allowParamChanges: args.allowParamChanges,
        allowVariantChanges: args.allowVariantChanges,
        allowMultipleRuns: args.allowMultipleRuns,
        effectiveRunCount: args.effectiveRunCount,
        deploymentMode: args.deploymentMode,
        isRunning: args.isRunning,
        setIsRunning: args.setIsRunning,
        setLocalRunCount: args.setLocalRunCount,
      }),
    [
      args.allowMultipleRuns,
      args.allowParamChanges,
      args.allowRun,
      args.allowVariantChanges,
      args.deploymentMode,
      args.effectiveRunCount,
      args.fallbackConfigId,
      args.isRunning,
      args.setIsRunning,
      args.setLocalRunCount,
    ],
  );
  const handleReset = useMemo(
    () => createResetHandler(args.sharePolicy, args.setLocalRunCount),
    [args.setLocalRunCount, args.sharePolicy],
  );
  const handleDownloadArtifact = useMemo(
    () =>
      createDownloadArtifactHandler({
        allowFileDownloads: args.allowFileDownloads,
        fallbackConfigId: args.fallbackConfigId,
      }),
    [args.allowFileDownloads, args.fallbackConfigId],
  );
  const handleDownloadBinary = useMemo(
    () =>
      createDownloadBinaryHandler({
        allowFileDownloads: args.allowFileDownloads,
        shareSessionId: args.shareSessionId,
      }),
    [args.allowFileDownloads, args.shareSessionId],
  );
  const handleOpenExternalLink = useMemo(
    () =>
      createOpenExternalLinkHandler({
        allowExternalLinks: args.allowExternalLinks,
      }),
    [args.allowExternalLinks],
  );
  return useMemo(
    () =>
      buildActionHandlers({
        actionDefinitions: args.actionDefinitions,
        fallbackConfigId: args.fallbackConfigId,
        handleRun,
        handleReset,
        handleDownloadArtifact,
        handleDownloadBinary,
        handleOpenExternalLink,
      }),
    [
      args.actionDefinitions,
      args.fallbackConfigId,
      handleDownloadArtifact,
      handleDownloadBinary,
      handleOpenExternalLink,
      handleReset,
      handleRun,
    ],
  );
}
