import { useEffect, useMemo, useRef } from "react";

import { createSyntheticPixiWorkspaceGraph } from "./pixi-workspace-synthetic-graph";

export function PixiWorkspacePrototype({ debugEnabled }: { debugEnabled: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactRenderCount = useRef(0);
  reactRenderCount.current += 1;
  const syntheticGraph = window.setta.app.flags.pixiWorkspaceSyntheticGraph;
  const graph = useMemo(
    () => (syntheticGraph ? createSyntheticPixiWorkspaceGraph(syntheticGraph) : undefined),
    [syntheticGraph],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    let destroyRenderer: (() => void) | null = null;

    void import("./pixi-workspace-renderer")
      .then(async ({ createPixiWorkspaceRenderer }) => {
        const renderer = await createPixiWorkspaceRenderer({
          debugEnabled,
          graph,
          host,
          reactRenderCount: () => reactRenderCount.current,
        });
        if (disposed) {
          renderer.destroy();
          return;
        }
        destroyRenderer = () => renderer.destroy();
      })
      .catch((error: unknown) => {
        console.error("Failed to initialize Pixi workspace prototype", error);
      });

    return () => {
      disposed = true;
      destroyRenderer?.();
      if (debugEnabled) {
        delete window.__settaPixiWorkspaceDebug;
      }
    };
  }, [debugEnabled, graph]);

  return (
    <div
      ref={hostRef}
      className="h-screen w-screen overflow-hidden bg-zinc-950"
      data-testid="pixi-workspace"
    />
  );
}
