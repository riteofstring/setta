import _ from "lodash";
import { usePluginRuntimeStore } from "plugins/runtime";
import { useEffect, useMemo, useRef } from "react";

type PluginOverviewPaneProps = {
  pluginId: string;
  paneId: string;
};

export function PluginOverviewPane({
  pluginId,
  paneId,
}: PluginOverviewPaneProps) {
  const pane = usePluginRuntimeStore((state) => {
    const paneEntries = state.panesByPluginId[pluginId] ?? [];
    for (const entry of paneEntries) {
      if (entry.id === paneId) {
        return entry;
      }
    }
    return null;
  }, _.isEqual);

  const runtime = usePluginRuntimeStore(
    (state) => ({
      serverMode: state.serverMode ?? "ide",
      effectiveCapabilities:
        state.pluginListById[pluginId]?.effectiveCapabilities ?? [],
    }),
    _.isEqual,
  );

  const mountRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  const paneProps = useMemo(
    () => ({
      pluginId,
      serverMode: runtime.serverMode,
      effectiveCapabilities: runtime.effectiveCapabilities,
    }),
    [pluginId, runtime.effectiveCapabilities, runtime.serverMode],
  );

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement || !pane) {
      return;
    }
    pane.renderer.mount(mountElement, paneProps);
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pane.renderer.unmount?.(mountElement);
    };
  }, [pane, paneProps]);

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement || !pane || !pane.renderer.update) {
      return;
    }
    if (!mountedRef.current) {
      return;
    }
    pane.renderer.update(mountElement, paneProps);
  }, [pane, paneProps]);

  if (!pane) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center rounded border border-dashed border-setta-300 bg-setta-50/70 p-3 text-xs text-setta-600 dark:border-setta-700 dark:bg-setta-900/70 dark:text-setta-300">
        Plugin pane unavailable. Open Plugins tab and reload plugin frontends.
      </section>
    );
  }

  return (
    <section
      className="h-full min-h-0 overflow-auto rounded border border-setta-200 bg-setta-50/40 p-2 dark:border-setta-800 dark:bg-setta-950/40"
      data-testid={`plugin-overview-pane-${pluginId}-${paneId}`}
    >
      <div ref={mountRef} className="h-full w-full" />
    </section>
  );
}
