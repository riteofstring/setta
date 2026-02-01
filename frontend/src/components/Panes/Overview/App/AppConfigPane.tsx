import { useEffect, useMemo, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore, useAppPreview, useLocalStorage, useProjectState } from "state/definitions";
import { OverviewTabNameEnum } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_get_app_spec,
  route_set_app_spec,
} from "utils/generatedEndpoints";

type AppSpecPayload = Record<string, unknown>;

const DEFAULT_CATALOG_ID = "setta.app.default";
const DEFAULT_SPEC_VERSION = "v1";

function buildDefaultSpec(): AppSpecPayload {
  const root: AppSpecPayload = {
    key: "app-root",
    type: "Stack",
    props: { direction: "column", gap: 16 },
    children: [
      {
        key: "app-hero",
        type: "Card",
        props: {
          title: "App Inputs",
          description: "Bind inputs to Setta params.",
        },
        children: [
          {
            key: "app-param-1",
            type: "ParamInput",
            props: {
              sectionId: "SECTION_ID",
              paramId: "PARAM_ID",
              label: "Parameter",
            },
          },
          {
            key: "app-run",
            type: "ActionButton",
            props: {
              label: "Run",
              action: "run",
            },
          },
        ],
      },
      {
        key: "app-output",
        type: "Card",
        props: { title: "Output" },
        children: [
          {
            key: "app-text-output",
            type: "TextOutput",
            props: {
              sectionId: "SECTION_ID",
              label: "Result",
            },
          },
        ],
      },
    ],
  };
  return {
    root,
    elements: buildElementIndex(root as AppSpecPayload),
  };
}

function buildElementIndex(root: AppSpecPayload): Record<string, AppSpecPayload> {
  const elements: Record<string, AppSpecPayload> = {};
  const stack: AppSpecPayload[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const key = current.key;
    if (typeof key !== "string" || elements[key]) {
      continue;
    }
    elements[key] = current;
    const children = current.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === "object") {
          stack.push(child as AppSpecPayload);
        }
      }
    }
  }
  return elements;
}

export function AppConfigPane() {
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const appSpec = useProjectState((x) => x.appSpec);
  const isPreviewEnabled = useAppPreview((x) => x.isPreviewEnabled);
  const [draftSpec, setDraftSpec] = useState("");
  const [catalogId, setCatalogId] = useState(DEFAULT_CATALOG_ID);
  const [specVersion, setSpecVersion] = useState(DEFAULT_SPEC_VERSION);
  const [appSpecPath, setAppSpecPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasDraft = useMemo(() => draftSpec.trim().length > 0, [draftSpec]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!projectConfigId) {
        return;
      }
      setLoading(true);
      setErrorMessage(null);
      const res = await route_get_app_spec({ projectConfigId });
      setLoading(false);
      if (!res200(res)) {
        if (isMounted) {
          setErrorMessage("Failed to load app spec.");
        }
        return;
      }
      const nextSpec = res.data.appSpec ?? null;
      useProjectState.setState({ appSpec: nextSpec });
      useProjectState.setState((state) => {
        state.projectConfig.appConfig = res.data.appConfig ?? null;
      });
      if (isMounted) {
        setDraftSpec(
          nextSpec ? JSON.stringify(nextSpec, null, 2) : "",
        );
        setCatalogId(res.data.appConfig?.catalogId ?? DEFAULT_CATALOG_ID);
        setSpecVersion(res.data.appConfig?.appSpecVersion ?? DEFAULT_SPEC_VERSION);
        setAppSpecPath(res.data.appConfig?.appSpecPath ?? "");
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [projectConfigId]);

  function handleGeneratePrompt() {
    const sections = Object.values(useProjectState.getState().sectionImpls)
      .map((section) => `${section.name} (${section.id})`)
      .join("\n");
    const prompt = `Generate a JSON Render app spec using catalog "${catalogId}".\n\nRules:\n- Use only catalog components.\n- Bind ParamInput with sectionId + paramId.\n- Include one ActionButton with action "run".\n- Return JSON only (no prose).\n\nAvailable sections:\n${sections || "No sections yet."}\n\nOutput format should be a UITree object: { root: UIElement, elements: { [key]: UIElement } }.`;
    useAIStore.setState({ pendingProjectChatPrompt: prompt });
    useLocalStorage.setState({
      overviewTab: OverviewTabNameEnum.ProjectAIChat,
      overviewVis: true,
    });
  }

  function handleCreateDefault() {
    const spec = buildDefaultSpec();
    setDraftSpec(JSON.stringify(spec, null, 2));
    if (!appSpecPath) {
      setAppSpecPath(`app_specs/${projectConfigId}.json`);
    }
  }

  async function handleSave() {
    if (!projectConfigId) {
      setErrorMessage("No active project config.");
      return;
    }
    setErrorMessage(null);
    let parsed: AppSpecPayload | null = null;
    try {
      parsed = JSON.parse(draftSpec) as AppSpecPayload;
    } catch (err) {
      setErrorMessage("Invalid JSON in app spec.");
      return;
    }
    setLoading(true);
    const res = await route_set_app_spec({
      projectConfigId,
      appSpec: parsed,
      appSpecPath: appSpecPath.trim() ? appSpecPath.trim() : undefined,
      appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
      catalogId: catalogId.trim() ? catalogId.trim() : undefined,
    });
    setLoading(false);
    if (!res200(res)) {
      setErrorMessage("Failed to save app spec.");
      return;
    }
    useProjectState.setState({ appSpec: res.data.appSpec ?? null });
    useProjectState.setState((state) => {
      state.projectConfig.appConfig = res.data.appConfig ?? null;
    });
    addTemporaryNotification("App spec saved.");
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 pr-2 text-sm text-setta-600 dark:text-setta-300">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-setta-500 dark:text-setta-400">
            App Config
          </h3>
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Manage the JSON-rendered app spec and preview.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={() =>
              useAppPreview.setState((state) => ({
                isPreviewEnabled: !state.isPreviewEnabled,
              }))
            }
          >
            {isPreviewEnabled ? "Hide Preview" : "Show Preview"}
          </button>
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={handleGeneratePrompt}
          >
            Generate App
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-3 rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
        <label className="flex flex-col gap-1 text-xs">
          Catalog ID
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={catalogId}
            onChange={(event) => setCatalogId(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Spec version
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={specVersion}
            onChange={(event) => setSpecVersion(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Spec path
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            placeholder="app_specs/app.json"
            value={appSpecPath}
            onChange={(event) => setAppSpecPath(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-setta-500 dark:text-setta-400">
          <span>App Spec JSON</span>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={handleCreateDefault}
            >
              Create Default
            </button>
            <button
              className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSave()}
              disabled={loading || !hasDraft}
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <textarea
          className="min-h-[280px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder={
            appSpec
              ? "Edit the app spec JSON."
              : "No app spec yet. Create or generate one."
          }
          value={draftSpec}
          onChange={(event) => setDraftSpec(event.target.value)}
        />
      </div>
    </section>
  );
}
