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
import { route_run_code } from "utils/generatedEndpoints";
import type { AppConfig, SharePolicy } from "utils/generatedTypes";
import { AppActionContext } from "./appContext";
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
  const resolvedPolicy = resolvePolicyOverrides(appPolicy ?? sharePolicy);
  const tree = useMemo(() => normalizeAppSpec(appSpec), [appSpec]);
  const [runCount, setRunCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const allowMultipleRuns = resolvedPolicy.allowMultipleRuns ?? true;
  const canRun =
    resolvedPolicy.allowRun &&
    (allowMultipleRuns || runCount === 0);
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

  const actionHandlers = useMemo(
    () => ({
      run: handleRun,
      reset: handleReset,
    }),
    [handleReset, handleRun],
  );

  if (!tree || !tree.root) {
    return (
      <div className="rounded-2xl border border-dashed border-setta-200 bg-white/60 px-6 py-10 text-center text-sm text-setta-500 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400">
        No app spec found. Generate or save an app spec to preview.
      </div>
    );
  }

  return (
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
  );
}
