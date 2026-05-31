import { useEffect, useRef } from "react";

export function PixiWorkspacePrototype({ debugEnabled }: { debugEnabled: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactRenderCount = useRef(0);
  reactRenderCount.current += 1;

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
  }, [debugEnabled]);

  return (
    <div
      ref={hostRef}
      className="h-screen w-screen overflow-hidden bg-zinc-950"
      data-testid="pixi-workspace"
    />
  );
}
