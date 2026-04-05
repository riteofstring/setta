import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  DataProvider,
  Renderer,
  VisibilityProvider,
} from "@json-render/react";
import { getAttachmentDownloadUrl, runCode } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ensureAppProjectConfigLoaded,
  incrementAppSessionRunCount,
  resetAppDeployment,
} from "state/actions/app";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAppConfigs, useShareSession } from "state/definitions";
import { resolveAppPolicy } from "utils/deploymentPolicies";
import { res200 } from "utils/endpointUtils";
import type { AppDefinition, Policy } from "utils/generatedTypes";
import {
  resolveMainRunRequest,
  resolveRunRequest,
} from "utils/runCapabilities";
import { normalizeActionDefinitions, resolveActionType } from "./appBindings";
import { AppActionContext, AppRuntimeContext } from "./appContext";
import "./appMotion.css";
import { appRegistry } from "./appRegistry";
import { AppBreakpointProvider } from "./appResponsive";
import { resolveAppTheme } from "./appTheme";
import { buildAppBinaryDownloadUrl } from "./appTransport";

type RawUIElement = {
  key: string;
  type: string;
  props?: unknown;
  children?: unknown;
  parentKey?: unknown;
  visible?: unknown;
};

type AppRendererProps = {
  appSpec: unknown | null;
  appDefinition: AppDefinition | null | undefined;
  appPolicy?: Policy | null;
  defaultConfigId?: string | null;
  rootKeyOverride?: string | null;
};

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

function isUIElement(value: unknown): value is RawUIElement {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.key === "string" && typeof record.type === "string";
}

function normalizeElements(
  root: RawUIElement,
  elements: Record<string, RawUIElement>,
): Spec["elements"] {
  const output: Spec["elements"] = {};
  const stack: Array<{ element: RawUIElement; parentKey: string | null }> = [
    { element: root, parentKey: null },
  ];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const { element, parentKey } = current;
    if (visited.has(element.key)) {
      continue;
    }
    visited.add(element.key);
    const children = Array.isArray(element.children) ? element.children : [];
    const childKeys: string[] = [];
    for (const child of children) {
      if (typeof child === "string") {
        const childElement = elements[child];
        if (childElement) {
          childKeys.push(child);
          stack.push({ element: childElement, parentKey: element.key });
        }
        continue;
      }
      if (isUIElement(child)) {
        childKeys.push(child.key);
        stack.push({ element: child, parentKey: element.key });
      }
    }
    const props = isRecord(element.props) ? element.props : {};
    const visible = element.visible;
    output[element.key] = {
      key: element.key,
      type: element.type,
      props,
      parentKey,
      ...(visible !== undefined ? { visible } : {}),
      children: childKeys.length > 0 ? childKeys : undefined,
    };
  }
  return output;
}

function normalizeAppSpec(
  spec: unknown,
  rootKeyOverride?: string | null,
): Spec | null {
  if (!spec || typeof spec !== "object") {
    return null;
  }
  const overrideKey =
    typeof rootKeyOverride === "string" && rootKeyOverride.trim().length > 0
      ? rootKeyOverride
      : null;
  const record = spec as Record<string, unknown>;
  if ("root" in record && "elements" in record) {
    const elementsRaw = record.elements;
    const rootRaw = record.root;
    if (elementsRaw && typeof elementsRaw === "object") {
      const rawElements: Record<string, RawUIElement> = {};
      for (const [key, value] of Object.entries(
        elementsRaw as Record<string, unknown>,
      )) {
        if (isUIElement(value)) {
          rawElements[key] = value;
        }
      }
      if (overrideKey) {
        const overrideRoot = rawElements[overrideKey];
        if (!overrideRoot) {
          return null;
        }
        return {
          root: overrideKey,
          elements: normalizeElements(overrideRoot, rawElements),
        };
      }
      if (typeof rootRaw === "string") {
        const root = rawElements[rootRaw];
        if (!root) {
          return null;
        }
        return {
          root: rootRaw,
          elements: normalizeElements(root, rawElements),
        };
      }
      if (isUIElement(rootRaw)) {
        const root = rootRaw;
        const merged = { ...rawElements, [root.key]: root };
        return { root: root.key, elements: normalizeElements(root, merged) };
      }
    }
  }
  if (overrideKey) {
    return null;
  }
  if (isUIElement(spec)) {
    const merged = { [spec.key]: spec };
    return { root: spec.key, elements: normalizeElements(spec, merged) };
  }
  return null;
}

export function AppRenderer({
  appSpec,
  appDefinition,
  appPolicy,
  defaultConfigId,
  rootKeyOverride,
}: AppRendererProps) {
  const fallbackConfigId = defaultConfigId ?? null;
  const sharePolicy = useShareSession((x) => x.sharePolicy);
  const shareSessionId = useShareSession((x) => x.shareSessionId);
  const resolvedPolicy = resolveAppPolicy(appPolicy ?? sharePolicy);
  const resolvedTheme = useMemo(
    () => resolveAppTheme(appDefinition?.theme),
    [appDefinition?.theme],
  );
  const spec = useMemo(
    () => normalizeAppSpec(appSpec, rootKeyOverride),
    [appSpec, rootKeyOverride],
  );
  const deploymentMode = useShareSession((x) => x.isDeploymentMode);
  const sessionRunCount = useShareSession((x) => x.sessionRunCount);
  const [localRunCount, setLocalRunCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const allowMultipleRuns = resolvedPolicy.allowMultipleRuns ?? true;
  const effectiveRunCount = deploymentMode ? sessionRunCount : localRunCount;
  const loadedDefaultRunRequest = useAppConfigs((state) => {
    if (!fallbackConfigId) {
      return null;
    }
    const configState = state.configs[fallbackConfigId] ?? null;
    if (!configState) {
      return null;
    }
    return resolveMainRunRequest(configState);
  });
  const canRun =
    resolvedPolicy.allowRun &&
    (allowMultipleRuns || effectiveRunCount === 0) &&
    (loadedDefaultRunRequest?.canRun ?? true);
  const canEditParams = resolvedPolicy.allowParamChanges ?? true;
  const allowExternalLinks = resolvedPolicy.allowExternalLinks ?? false;
  const allowFileDownloads = resolvedPolicy.allowFileDownloads ?? false;
  let runDisabledReason: string | null = null;
  if (!resolvedPolicy.allowRun) {
    runDisabledReason = "Runs are disabled by policy.";
  } else if (!allowMultipleRuns && effectiveRunCount > 0) {
    runDisabledReason = "This app is limited to one run.";
  } else if (loadedDefaultRunRequest && !loadedDefaultRunRequest.canRun) {
    runDisabledReason =
      loadedDefaultRunRequest.disabledReason ?? "Run is unavailable.";
  }

  const handleRun = useCallback(
    async (params?: Record<string, unknown>) => {
      const configId =
        params && typeof params.configId === "string"
          ? params.configId
          : fallbackConfigId;
      if (!configId) {
        addTemporaryNotification("Missing project config for run.");
        return;
      }
      if (!resolvedPolicy.allowRun) {
        addTemporaryNotification("Runs are disabled by policy.");
        return;
      }
      if (!allowMultipleRuns && effectiveRunCount > 0) {
        addTemporaryNotification("This app only allows one run.");
        return;
      }
      if (isRunning) {
        return;
      }
      const rawSectionVariantOverrides = params?.sectionVariantOverrides;
      const rawParamOverrides = params?.paramOverrides;
      const sectionVariantOverrides =
        rawSectionVariantOverrides === undefined
          ? null
          : toStringRecord(rawSectionVariantOverrides);
      const paramOverrides =
        rawParamOverrides === undefined
          ? null
          : toStringRecord(rawParamOverrides);
      if (
        rawSectionVariantOverrides !== undefined &&
        !sectionVariantOverrides
      ) {
        addTemporaryNotification(
          "Invalid sectionVariantOverrides (expected object of string -> string).",
        );
        return;
      }
      if (rawParamOverrides !== undefined && !paramOverrides) {
        addTemporaryNotification(
          "Invalid paramOverrides (expected object of string -> string).",
        );
        return;
      }
      const hasSectionVariantOverrides =
        sectionVariantOverrides != null &&
        Object.keys(sectionVariantOverrides).length > 0;
      const hasParamOverrides =
        paramOverrides != null && Object.keys(paramOverrides).length > 0;
      if (hasSectionVariantOverrides && !resolvedPolicy.allowVariantChanges) {
        addTemporaryNotification("Variant changes are disabled by policy.");
        return;
      }
      if (hasParamOverrides && !resolvedPolicy.allowParamChanges) {
        addTemporaryNotification("Param changes are disabled by policy.");
        return;
      }
      const loaded = await ensureAppProjectConfigLoaded(configId);
      if (!loaded) {
        addTemporaryNotification("Failed to load project config.");
        return;
      }
      const configState = useAppConfigs.getState().configs[configId] ?? null;
      if (!configState) {
        addTemporaryNotification("Failed to load project config.");
        return;
      }
      const requestedSectionId =
        params && typeof params.sectionId === "string"
          ? params.sectionId
          : null;
      const runRequest = resolveRunRequest(configState, requestedSectionId);
      if (!runRequest.canRun) {
        addTemporaryNotification(
          runRequest.disabledReason ?? "Run is unavailable.",
        );
        return;
      }
      setIsRunning(true);
      try {
        const res = await callOpenAPI(
          runCode({
            body: {
              projectConfigId: configId,
              sectionId: runRequest.executionSectionId,
              ...(hasSectionVariantOverrides
                ? { sectionVariantOverrides }
                : {}),
              ...(hasParamOverrides ? { paramOverrides } : {}),
            },
          }),
        );
        if (res200(res)) {
          if (deploymentMode) {
            incrementAppSessionRunCount();
          } else {
            setLocalRunCount((count) => count + 1);
          }
          return;
        }
        addTemporaryNotification("Run failed.");
      } catch {
        addTemporaryNotification("Run failed.");
      } finally {
        setIsRunning(false);
      }
    },
    [
      allowMultipleRuns,
      fallbackConfigId,
      isRunning,
      resolvedPolicy.allowRun,
      effectiveRunCount,
      deploymentMode,
      resolvedPolicy.allowParamChanges,
      resolvedPolicy.allowVariantChanges,
    ],
  );

  const handleReset = useCallback(async () => {
    setLocalRunCount(0);
    if (sharePolicy) {
      await resetAppDeployment();
    }
  }, [sharePolicy]);

  const handleDownloadArtifact = useCallback(
    async (
      artifactId?: string | null,
      filename?: string | null,
      configId?: string | null,
    ) => {
      if (!allowFileDownloads) {
        addTemporaryNotification("File downloads are disabled by policy.");
        return;
      }
      if (!artifactId) {
        addTemporaryNotification("Missing artifact id for download.");
        return;
      }
      const resolvedConfigId = configId ?? fallbackConfigId;
      if (!resolvedConfigId) {
        addTemporaryNotification("Missing project config for download.");
        return;
      }
      const res = await callOpenAPI(
        getAttachmentDownloadUrl({
          body: {
            artifactId,
            projectConfigId: resolvedConfigId,
          },
        }),
      );
      if (res200(res) && res.data.url) {
        triggerDownload(res.data.url, filename ?? undefined);
        return;
      }
      addTemporaryNotification("Failed to start download.");
    },
    [allowFileDownloads, fallbackConfigId],
  );

  const handleDownloadBinary = useCallback(
    (contentId?: string | null, filename?: string | null) => {
      if (!allowFileDownloads) {
        addTemporaryNotification("File downloads are disabled by policy.");
        return;
      }
      if (!contentId) {
        addTemporaryNotification("Missing file content id for download.");
        return;
      }
      const url = new URL(buildAppBinaryDownloadUrl(contentId, shareSessionId));
      triggerDownload(url.toString(), filename ?? undefined);
    },
    [allowFileDownloads, shareSessionId],
  );

  const handleOpenExternalLink = useCallback(
    (url?: string | null) => {
      if (!allowExternalLinks) {
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
    },
    [allowExternalLinks],
  );

  const actionDefinitions = useMemo(
    () => normalizeActionDefinitions(appDefinition?.actions),
    [appDefinition?.actions],
  );
  const themeClassName = resolvedTheme.className ?? "";

  const actionHandlers = useMemo(() => {
    const handlers: Record<
      string,
      (params?: Record<string, unknown>) => void | Promise<void>
    > = {
      run: handleRun,
      reset: handleReset,
    };
    for (const [name, definition] of Object.entries(actionDefinitions)) {
      const actionType = resolveActionType(name, definition);
      if (actionType === "run") {
        handlers[name] = (params) => {
          const paramSectionId =
            params && typeof params.sectionId === "string"
              ? params.sectionId
              : null;
          const fallbackSectionId =
            typeof definition.sectionId === "string"
              ? definition.sectionId
              : null;
          const resolvedSectionId = paramSectionId ?? fallbackSectionId;
          const paramConfigId =
            params && typeof params.configId === "string"
              ? params.configId
              : null;
          const resolvedConfigId =
            paramConfigId ??
            (typeof definition.configId === "string"
              ? definition.configId
              : null) ??
            fallbackConfigId;
          const rawParamOverrides =
            params?.paramOverrides ?? definition.paramOverrides ?? undefined;
          const rawSectionVariantOverrides =
            params?.sectionVariantOverrides ??
            definition.sectionVariantOverrides ??
            undefined;
          return handleRun(
            resolvedSectionId
              ? {
                  sectionId: resolvedSectionId,
                  configId: resolvedConfigId ?? undefined,
                  paramOverrides: rawParamOverrides,
                  sectionVariantOverrides: rawSectionVariantOverrides,
                }
              : {
                  configId: resolvedConfigId ?? undefined,
                  paramOverrides: rawParamOverrides,
                  sectionVariantOverrides: rawSectionVariantOverrides,
                },
          );
        };
        continue;
      }
      if (actionType === "reset") {
        handlers[name] = () => handleReset();
        continue;
      }
      if (actionType === "downloadArtifact") {
        handlers[name] = (params) => {
          const paramArtifactId =
            params && typeof params.artifactId === "string"
              ? params.artifactId
              : null;
          const fallbackArtifactId =
            typeof definition.artifactId === "string"
              ? definition.artifactId
              : null;
          const paramConfigId =
            params && typeof params.configId === "string"
              ? params.configId
              : null;
          const definitionConfigId =
            typeof definition.configId === "string"
              ? definition.configId
              : null;
          const filename =
            typeof definition.filename === "string"
              ? definition.filename
              : null;
          const resolvedConfigId =
            paramConfigId ?? definitionConfigId ?? fallbackConfigId;
          return handleDownloadArtifact(
            paramArtifactId ?? fallbackArtifactId,
            filename,
            resolvedConfigId,
          );
        };
        continue;
      }
      if (actionType === "downloadBinary") {
        handlers[name] = (params) => {
          const paramContentId =
            params && typeof params.contentId === "string"
              ? params.contentId
              : null;
          const fallbackContentId =
            typeof definition.contentId === "string"
              ? definition.contentId
              : null;
          const filename =
            typeof definition.filename === "string"
              ? definition.filename
              : null;
          return handleDownloadBinary(
            paramContentId ?? fallbackContentId,
            filename,
          );
        };
        continue;
      }
      if (actionType === "openExternalLink") {
        handlers[name] = (params) => {
          const paramUrl =
            params && typeof params.url === "string" ? params.url : null;
          const fallbackUrl =
            typeof definition.url === "string" ? definition.url : null;
          return handleOpenExternalLink(paramUrl ?? fallbackUrl);
        };
      }
    }
    return handlers;
  }, [
    actionDefinitions,
    fallbackConfigId,
    handleDownloadArtifact,
    handleDownloadBinary,
    handleOpenExternalLink,
    handleReset,
    handleRun,
  ]);

  if (!spec || !spec.elements[spec.root]) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-6 py-10 text-center text-[color:var(--app-muted)] [font-size:var(--app-text-sm)]">
        No app spec found. Generate or save an app spec to preview.
      </div>
    );
  }

  return (
    <AppRuntimeContext.Provider
      value={{
        dataBindings: appDefinition?.dataBindings ?? {},
        actions: actionDefinitions,
        policy: resolvedPolicy,
        canEditParams,
        allowExternalLinks,
        allowFileDownloads,
        defaultConfigId: fallbackConfigId ?? null,
        theme: resolvedTheme,
      }}
    >
      <AppActionContext.Provider
        value={{
          canRun,
          canReset: true,
          isRunning,
          runDisabledReason,
        }}
      >
        <DataProvider initialData={appDefinition?.dataBindings ?? {}}>
          <VisibilityProvider>
            <ActionProvider handlers={actionHandlers}>
              <div
                className={themeClassName}
                style={resolvedTheme.style as CSSProperties}
              >
                <AppBreakpointProvider>
                  <Renderer spec={spec} registry={appRegistry} />
                </AppBreakpointProvider>
              </div>
            </ActionProvider>
          </VisibilityProvider>
        </DataProvider>
      </AppActionContext.Provider>
    </AppRuntimeContext.Provider>
  );
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
