import {
  ActionProvider,
  DataProvider,
  Renderer,
  VisibilityProvider,
} from "@json-render/react";
import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ensureAppProjectConfigLoaded,
  resetAppDeployment,
} from "state/actions/app";
import { addTemporaryNotification } from "state/actions/notifications";
import { useShareSession } from "state/definitions";
import { C_ADDRESSES } from "utils/c_addresses";
import { res200 } from "utils/endpointUtils";
import {
  route_get_attachment_download_url,
  route_run_code,
  route_set_param_entered_value,
  route_set_section_variant,
} from "utils/generatedEndpoints";
import type { AppDefinition, SharePolicy } from "utils/generatedTypes";
import { RouteEnum } from "utils/generatedTypes";
import { normalizeActionDefinitions, resolveActionType } from "./appBindings";
import { AppActionContext, AppRuntimeContext } from "./appContext";
import { appRegistry } from "./appRegistry";
import { resolveAppTheme } from "./appTheme";

type UIElement = {
  key: string;
  type: string;
  props?: Record<string, unknown>;
  children?: Array<UIElement | string>;
  parentKey?: string | null;
};

type UITree = {
  root: string;
  elements: Record<string, UIElement>;
};

type AppRendererProps = {
  appSpec: unknown | null;
  appDefinition: AppDefinition | null | undefined;
  appPolicy?: SharePolicy | null;
  defaultConfigId?: string | null;
  rootKeyOverride?: string | null;
};

function isUIElement(value: unknown): value is UIElement {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.key === "string" && typeof record.type === "string";
}

function normalizeElements(
  root: UIElement,
  elements: Record<string, UIElement>,
): Record<string, UIElement> {
  const output: Record<string, UIElement> = {};
  const stack: Array<{ element: UIElement; parentKey: string | null }> = [
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
    output[element.key] = {
      ...element,
      parentKey,
      children: childKeys.length > 0 ? childKeys : undefined,
    };
  }
  return output;
}

function normalizeAppSpec(
  spec: unknown,
  rootKeyOverride?: string | null,
): UITree | null {
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
      const elements = elementsRaw as Record<string, UIElement>;
      if (overrideKey) {
        const overrideRoot = elements[overrideKey];
        if (!overrideRoot) {
          return null;
        }
        return {
          root: overrideKey,
          elements: normalizeElements(overrideRoot, elements),
        };
      }
      if (typeof rootRaw === "string") {
        const root = elements[rootRaw];
        if (!root) {
          return null;
        }
        return { root: rootRaw, elements: normalizeElements(root, elements) };
      }
      if (isUIElement(rootRaw)) {
        const root = rootRaw;
        const merged = { ...elements, [root.key]: root };
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

function resolvePolicyOverrides(
  appPolicy: SharePolicy | null | undefined,
): SharePolicy {
  if (appPolicy) {
    return appPolicy;
  }
  return {
    allowParamChanges: true,
    allowVariantChanges: false,
    allowLayoutChanges: false,
    allowRun: true,
    allowLLM: false,
    allowExternalLinks: false,
    allowFileDownloads: false,
    allowMultipleRuns: true,
    runSnapshotMode: "ephemeral",
  };
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
  const resolvedPolicy = resolvePolicyOverrides(appPolicy ?? sharePolicy);
  const resolvedTheme = useMemo(
    () => resolveAppTheme(appDefinition?.theme),
    [appDefinition?.theme],
  );
  const tree = useMemo(
    () => normalizeAppSpec(appSpec, rootKeyOverride),
    [appSpec, rootKeyOverride],
  );
  const [runCount, setRunCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const allowMultipleRuns = resolvedPolicy.allowMultipleRuns ?? true;
  const canRun =
    resolvedPolicy.allowRun && (allowMultipleRuns || runCount === 0);
  const canEditParams = resolvedPolicy.allowParamChanges ?? true;
  const allowExternalLinks = resolvedPolicy.allowExternalLinks ?? false;
  const allowFileDownloads = resolvedPolicy.allowFileDownloads ?? false;
  let runDisabledReason: string | null = null;
  if (!resolvedPolicy.allowRun) {
    runDisabledReason = "Runs are disabled by policy.";
  } else if (!allowMultipleRuns && runCount > 0) {
    runDisabledReason = "This app is limited to one run.";
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
      if (!allowMultipleRuns && runCount > 0) {
        addTemporaryNotification("This app only allows one run.");
        return;
      }
      if (isRunning) {
        return;
      }
      const sectionVariantOverrides =
        params && typeof params.sectionVariantOverrides === "object"
          ? (params.sectionVariantOverrides as Record<string, string>)
          : null;
      const paramOverrides =
        params && typeof params.paramOverrides === "object"
          ? (params.paramOverrides as Record<string, string>)
          : null;
      if (sectionVariantOverrides && !resolvedPolicy.allowVariantChanges) {
        addTemporaryNotification("Variant changes are disabled by policy.");
        return;
      }
      if (paramOverrides && !resolvedPolicy.allowParamChanges) {
        addTemporaryNotification("Param changes are disabled by policy.");
        return;
      }
      const loaded = await ensureAppProjectConfigLoaded(configId);
      if (!loaded) {
        addTemporaryNotification("Failed to load project config.");
        return;
      }
      setIsRunning(true);
      const sectionId =
        params && typeof params.sectionId === "string"
          ? params.sectionId
          : null;
      if (sectionVariantOverrides) {
        for (const [sectionOverrideId, variantId] of Object.entries(
          sectionVariantOverrides,
        )) {
          await route_set_section_variant({
            projectConfigId: configId,
            sectionId: sectionOverrideId,
            variantId,
          });
        }
      }
      if (paramOverrides) {
        for (const [key, value] of Object.entries(paramOverrides)) {
          const [overrideSectionId, paramInfoId] = key.split(":");
          if (!overrideSectionId || !paramInfoId) {
            continue;
          }
          await route_set_param_entered_value({
            projectConfigId: configId,
            sectionId: overrideSectionId,
            paramInfoId,
            value,
          });
        }
      }
      const res = await route_run_code({
        projectConfigId: configId,
        sectionId,
      });
      setIsRunning(false);
      if (res200(res)) {
        setRunCount((count) => count + 1);
        return;
      }
      addTemporaryNotification("Run failed.");
    },
    [
      allowMultipleRuns,
      fallbackConfigId,
      isRunning,
      resolvedPolicy.allowRun,
      runCount,
      resolvedPolicy.allowParamChanges,
      resolvedPolicy.allowVariantChanges,
    ],
  );

  const handleReset = useCallback(async () => {
    setRunCount(0);
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
      const res = await route_get_attachment_download_url({
        artifactId,
        projectConfigId: resolvedConfigId,
      });
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
      const endpoint = RouteEnum.BINARY_DOWNLOAD.replace(
        "{contentId}",
        encodeURIComponent(contentId),
      );
      const url = new URL(`${C_ADDRESSES.BACKEND}${endpoint}`);
      if (shareSessionId) {
        url.searchParams.set("shareSessionId", shareSessionId);
      }
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
          return handleRun(
            resolvedSectionId
              ? {
                  sectionId: resolvedSectionId,
                  configId: resolvedConfigId ?? undefined,
                  paramOverrides:
                    typeof definition.paramOverrides === "object"
                      ? definition.paramOverrides
                      : undefined,
                  sectionVariantOverrides:
                    typeof definition.sectionVariantOverrides === "object"
                      ? definition.sectionVariantOverrides
                      : undefined,
                }
              : {
                  configId: resolvedConfigId ?? undefined,
                  paramOverrides:
                    typeof definition.paramOverrides === "object"
                      ? definition.paramOverrides
                      : undefined,
                  sectionVariantOverrides:
                    typeof definition.sectionVariantOverrides === "object"
                      ? definition.sectionVariantOverrides
                      : undefined,
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

  if (!tree || !tree.root) {
    return (
      <div className="rounded-2xl border border-dashed border-setta-200 bg-white/60 px-6 py-10 text-center text-sm text-setta-500 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400">
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
                <Renderer tree={tree} registry={appRegistry} />
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
