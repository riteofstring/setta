import _ from "lodash";
import {
  getPluginSectionFallbackReason,
  usePluginRuntimeStore,
  usePluginSectionKind,
} from "plugins/runtime";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useLocalStorage, useProjectState } from "state/definitions";
import { OverviewTabNameEnum } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_sections,
  route_plugins_status,
} from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

type PluginAreaProps = {
  sectionId: string;
  isUserView: boolean;
};

type PluginSectionRendererHostProps = {
  sectionId: string;
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  isUserView: boolean;
};

export function PluginArea({ sectionId, isUserView }: PluginAreaProps) {
  const { pluginId, kind, data, schemaVersion } = useProjectState((state) => {
    const pluginImpl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Plugin,
    );
    return {
      pluginId: pluginImpl.pluginId,
      kind: pluginImpl.kind,
      data: pluginImpl.data,
      schemaVersion: pluginImpl.schemaVersion,
    };
  }, _.isEqual);
  const pluginSectionKind = usePluginSectionKind(pluginId, kind);
  if (pluginSectionKind) {
    return (
      <PluginSectionRendererHost
        sectionId={sectionId}
        pluginId={pluginId}
        kind={kind}
        data={data}
        isUserView={isUserView}
      />
    );
  }

  return (
    <PluginSectionFallbackCard
      sectionId={sectionId}
      pluginId={pluginId}
      kind={kind}
      data={data}
      schemaVersion={schemaVersion}
    />
  );
}

function PluginSectionRendererHost({
  sectionId,
  pluginId,
  kind,
  data,
  isUserView,
}: PluginSectionRendererHostProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const pluginSectionKind = usePluginSectionKind(pluginId, kind);
  const runtimeContext = usePluginRuntimeStore((state) => {
    const pluginEntry = state.pluginListById[pluginId];
    return {
      serverMode: state.serverMode ?? "ide",
      effectiveCapabilities: pluginEntry?.effectiveCapabilities ?? [],
    };
  }, _.isEqual);
  const sectionProps = useMemo(
    () => ({
      sectionId,
      pluginId,
      kind,
      data,
      readOnly: isUserView,
      serverMode: runtimeContext.serverMode,
      effectiveCapabilities: runtimeContext.effectiveCapabilities,
    }),
    [
      data,
      isUserView,
      kind,
      pluginId,
      runtimeContext.effectiveCapabilities,
      runtimeContext.serverMode,
      sectionId,
    ],
  );

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement || !pluginSectionKind) {
      return;
    }
    pluginSectionKind.renderer.mount(mountElement, sectionProps);
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pluginSectionKind.renderer.unmount?.(mountElement);
    };
  }, [pluginSectionKind, sectionProps]);

  useEffect(() => {
    if (!pluginSectionKind) {
      return;
    }
    if (!pluginSectionKind.renderer.update) {
      return;
    }
    const mountElement = mountRef.current;
    if (!mountElement || !mountedRef.current) {
      return;
    }
    pluginSectionKind.renderer.update(mountElement, sectionProps);
  }, [pluginSectionKind, sectionProps]);

  return (
    <section
      className="section-main-full-w section-main relative h-full min-h-0 overflow-hidden"
      data-setta-plugin-root={pluginId}
      data-setta-plugin-kind={kind}
    >
      <div ref={mountRef} className="h-full w-full" />
    </section>
  );
}

type PluginSectionFallbackCardProps = {
  sectionId: string;
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  schemaVersion: number | null;
};

function PluginSectionFallbackCard({
  sectionId,
  pluginId,
  kind,
  data,
  schemaVersion,
}: PluginSectionFallbackCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const reason = getPluginSectionFallbackReason(pluginId, kind);
  const reasonLabel = fallbackReasonLabel(reason);
  const dataPreview = useMemo(() => buildPluginDataPreview(data), [data]);

  async function onDeleteSection(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (isDeleting) {
      return;
    }
    setIsDeleting(true);
    const response = await route_delete_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: [sectionId],
    });
    setIsDeleting(false);
    if (!res200(response)) {
      addTemporaryNotification("Failed to delete plugin section.", "error");
      return;
    }
    addTemporaryNotification("Plugin section deleted.", "info");
  }

  async function onCopySectionJson(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const payload = JSON.stringify(
      {
        sectionId,
        pluginId,
        kind,
        schemaVersion,
        data,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      addTemporaryNotification("Copied plugin section JSON.", "info");
    } catch {
      addTemporaryNotification("Failed to copy plugin section JSON.", "error");
    }
  }

  async function onOpenPlugins(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    useLocalStorage.setState({
      overviewVis: true,
      overviewTab: OverviewTabNameEnum.Plugins,
    });
    // Fetch status immediately so the tab opens with fresh diagnostics.
    await route_plugins_status();
  }

  return (
    <section className="section-main-full-w flex h-full min-h-0 items-center justify-center p-3">
      <div className="w-full max-w-[520px] rounded-md border border-dashed border-setta-300 bg-setta-50/80 p-3 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-900/70 dark:text-setta-200">
        <header className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold tracking-tight text-setta-900 dark:text-setta-100">
              Plugin Section Unavailable
            </h3>
            <p className="mt-0.5 text-[11px] text-setta-500 dark:text-setta-400">
              {reasonLabel}
            </p>
          </div>
          <span className="rounded bg-setta-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-setta-700 dark:bg-setta-800 dark:text-setta-300">
            fallback
          </span>
        </header>
        <dl className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-[11px]">
          <dt className="text-setta-500 dark:text-setta-400">pluginId</dt>
          <dd className="font-mono text-setta-800 dark:text-setta-100">
            {pluginId || "(empty)"}
          </dd>
          <dt className="text-setta-500 dark:text-setta-400">kind</dt>
          <dd className="font-mono text-setta-800 dark:text-setta-100">
            {kind || "(empty)"}
          </dd>
        </dl>
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-setta-200 bg-white p-2 text-[10px] leading-snug text-setta-700 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-300">
          {dataPreview}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-white dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={onOpenPlugins}
          >
            Open Plugins
          </button>
          <button
            type="button"
            className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-white dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={onCopySectionJson}
          >
            Copy Section JSON
          </button>
          <button
            type="button"
            className="rounded border border-red-300 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
            onClick={onDeleteSection}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Section"}
          </button>
        </div>
      </div>
    </section>
  );
}

function buildPluginDataPreview(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return '{"error":"Failed to stringify data"}';
  }
}

function fallbackReasonLabel(reason: string): string {
  if (reason === "plugin_disabled") {
    return "Plugin is installed but currently disabled.";
  }
  if (reason === "plugin_not_installed") {
    return "Plugin is not installed in this workspace/environment.";
  }
  if (reason === "mode_blocked") {
    return "Plugin capability is blocked in the current server mode.";
  }
  return "Plugin frontend renderer failed to load.";
}
