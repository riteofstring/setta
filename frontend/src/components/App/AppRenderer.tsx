import {
  ActionProvider,
  DataProvider,
  Renderer,
  VisibilityProvider,
} from "@json-render/react";
import React, { useCallback, useMemo, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { resetAppDeployment } from "state/actions/app";
import { useProjectState, useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_get_attachment_download_url,
  route_run_code,
} from "utils/generatedEndpoints";
import type { AppConfig, SharePolicy } from "utils/generatedTypes";
import { C_ADDRESSES } from "utils/c_addresses";
import { RouteEnum } from "utils/generatedTypes";
import {
  normalizeActionDefinitions,
  resolveActionType,
} from "./appBindings";
import { AppActionContext, AppRuntimeContext } from "./appContext";
import { appRegistry } from "./appRegistry";

type UIElement = {
  key: string;
  type: string;
  props?: Record<string, unknown>;
  children?: Array<UIElement | string>;
};

type UITree = {
  root: UIElement | string | null;
  elements: Record<string, UIElement>;
};

type AppRendererProps = {
  appSpec: unknown | null;
  appConfig: AppConfig | null | undefined;
  appPolicy?: SharePolicy | null;
};

function isUIElement(value: unknown): value is UIElement {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.key === "string" && typeof record.type === "string";
}

function buildElementIndex(root: UIElement): Record<string, UIElement> {
  const elements: Record<string, UIElement> = {};
  const stack: UIElement[] = [root];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    if (visited.has(current.key)) {
      continue;
    }
    visited.add(current.key);
    elements[current.key] = current;
    const children = current.children;
    if (!Array.isArray(children)) {
      continue;
    }
    for (const child of children) {
      if (isUIElement(child)) {
        stack.push(child);
      }
    }
  }
  return elements;
}

function expandElement(
  key: string,
  elements: Record<string, UIElement>,
  visited: Set<string>,
): UIElement | null {
  if (visited.has(key)) {
    return null;
  }
  const element = elements[key];
  if (!element) {
    return null;
  }
  visited.add(key);
  const children = element.children;
  if (!Array.isArray(children)) {
    return element;
  }
  const resolvedChildren: UIElement[] = [];
  for (const child of children) {
    if (typeof child === "string") {
      const resolved = expandElement(child, elements, visited);
      if (resolved) {
        resolvedChildren.push(resolved);
      }
    } else if (isUIElement(child)) {
      resolvedChildren.push(child);
    }
  }
  return { ...element, children: resolvedChildren };
}

function normalizeAppSpec(spec: unknown): UITree | null {
  if (!spec || typeof spec !== "object") {
    return null;
  }
  const record = spec as Record<string, unknown>;
  if ("root" in record && "elements" in record) {
    const elementsRaw = record.elements;
    const rootRaw = record.root;
    if (elementsRaw && typeof elementsRaw === "object") {
      const elements = elementsRaw as Record<string, UIElement>;
      if (typeof rootRaw === "string") {
        const root = expandElement(rootRaw, elements, new Set<string>());
        if (!root) {
          return null;
        }
        return { root, elements: buildElementIndex(root) };
      }
      if (isUIElement(rootRaw)) {
        const root = rootRaw;
        const indexed =
          Object.keys(elements).length > 0
            ? elements
            : buildElementIndex(root);
        return { root, elements: indexed };
      }
    }
  }
  if (isUIElement(spec)) {
    return { root: spec, elements: buildElementIndex(spec) };
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
  appConfig,
  appPolicy,
}: AppRendererProps) {
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const sharePolicy = useShareSession((x) => x.sharePolicy);
  const shareSessionId = useShareSession((x) => x.shareSessionId);
  const resolvedPolicy = resolvePolicyOverrides(appPolicy ?? sharePolicy);
  const tree = useMemo(() => normalizeAppSpec(appSpec), [appSpec]);
  const [runCount, setRunCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const allowMultipleRuns = resolvedPolicy.allowMultipleRuns ?? true;
  const canRun =
    resolvedPolicy.allowRun &&
    (allowMultipleRuns || runCount === 0);
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
      setIsRunning(true);
      const sectionId =
        params && typeof params.sectionId === "string" ? params.sectionId : null;
      const res = await route_run_code({
        projectConfigId,
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
      isRunning,
      projectConfigId,
      resolvedPolicy.allowRun,
      runCount,
    ],
  );

  const handleReset = useCallback(async () => {
    setRunCount(0);
    if (sharePolicy) {
      await resetAppDeployment();
    }
  }, [sharePolicy]);

  const handleDownloadArtifact = useCallback(
    async (artifactId?: string | null, filename?: string | null) => {
      if (!allowFileDownloads) {
        addTemporaryNotification("File downloads are disabled by policy.");
        return;
      }
      if (!artifactId) {
        addTemporaryNotification("Missing artifact id for download.");
        return;
      }
      const res = await route_get_attachment_download_url({
        artifactId,
        projectConfigId,
      });
      if (res200(res) && res.data.url) {
        triggerDownload(res.data.url, filename ?? undefined);
        return;
      }
      addTemporaryNotification("Failed to start download.");
    },
    [allowFileDownloads, projectConfigId],
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
    () => normalizeActionDefinitions(appConfig?.actions),
    [appConfig?.actions],
  );

  const actionHandlers = useMemo(
    () => {
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
              typeof definition.sectionId === "string" ? definition.sectionId : null;
            const resolvedSectionId = paramSectionId ?? fallbackSectionId;
            return handleRun(
              resolvedSectionId ? { sectionId: resolvedSectionId } : undefined,
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
            const filename =
              typeof definition.filename === "string"
                ? definition.filename
                : null;
            return handleDownloadArtifact(paramArtifactId ?? fallbackArtifactId, filename);
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
            return handleDownloadBinary(paramContentId ?? fallbackContentId, filename);
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
    },
    [
      actionDefinitions,
      handleDownloadArtifact,
      handleDownloadBinary,
      handleOpenExternalLink,
      handleReset,
      handleRun,
    ],
  );

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
        dataBindings: appConfig?.dataBindings ?? {},
        actions: actionDefinitions,
        policy: resolvedPolicy,
        canEditParams,
        allowExternalLinks,
        allowFileDownloads,
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
        <DataProvider initialData={appConfig?.dataBindings ?? {}}>
          <VisibilityProvider>
            <ActionProvider handlers={actionHandlers}>
              <Renderer tree={tree} registry={appRegistry} />
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
