import type { BackendHealth } from "@generated/backend";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RuntimeVersions } from "@shared/types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";

type BackendState =
  | { health: BackendHealth; message: string; status: "online" }
  | { health: null; message: string; status: "checking" | "offline" };

const initialBackendState: BackendState = {
  health: null,
  message: "Checking",
  status: "checking",
};

export function App() {
  const browserHostRef = useRef<HTMLDivElement | null>(null);
  const [backend, setBackend] = useState<BackendState>(initialBackendState);
  const [versions, setVersions] = useState<RuntimeVersions | null>(null);

  const refreshHealth = useCallback(async () => {
    setBackend({ health: null, message: "Checking", status: "checking" });
    try {
      const health = await window.setta.backend.health();
      setBackend({ health, message: `${health.name} ${health.version}`, status: "online" });
    } catch (error) {
      setBackend({
        health: null,
        message: error instanceof Error ? error.message : "Backend unavailable",
        status: "offline",
      });
    }
  }, []);

  useEffect(() => {
    void window.setta.app.versions().then(setVersions);
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    const host = browserHostRef.current;
    if (!host) {
      return;
    }

    const syncBounds = () => {
      const rect = host.getBoundingClientRect();
      void window.setta.browserPane.setBounds({
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      });
    };

    syncBounds();
    void window.setta.browserPane.loadPreview();

    const observer = new ResizeObserver(syncBounds);
    observer.observe(host);
    window.addEventListener("resize", syncBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, []);

  return (
    <div className="grid min-h-screen grid-rows-[56px_1fr] bg-zinc-50 text-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold">Setta</h1>
          <BackendBadge backend={backend} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Electron {versions?.electron ?? "--"}</span>
          <Button aria-label="Refresh backend health" onClick={() => void refreshHealth()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>
      <main className="grid min-h-0 grid-cols-[260px_1fr]">
        <aside className="border-r border-zinc-200 bg-white px-4 py-5">
          <nav className="space-y-1">
            <a
              className="block rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950"
              href="#workspace"
            >
              Workspace
            </a>
            <a className="block rounded-md px-3 py-2 text-sm text-zinc-600" href="#browser">
              Browser
            </a>
          </nav>
          <Separator className="my-5" />
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="text-zinc-500">Backend</dt>
              <dd className="mt-1 break-words font-medium text-zinc-800">{backend.message}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Runtime</dt>
              <dd className="mt-1 text-zinc-800">Node {versions?.node ?? "--"}</dd>
            </div>
          </dl>
        </aside>
        <section className="grid min-h-0 grid-rows-[180px_1fr] gap-4 p-4">
          <div id="workspace" className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">Workspace</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
                  Phase 1 shell with backend health and an embedded browser surface.
                </p>
              </div>
              <Badge variant="neutral">Skeleton</Badge>
            </div>
          </div>
          <div
            id="browser"
            className="grid min-h-0 grid-rows-[40px_1fr] rounded-lg border border-zinc-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4">
              <h2 className="text-sm font-semibold">Browser Pane</h2>
              <Badge variant="neutral">Local Preview</Badge>
            </div>
            <div
              ref={browserHostRef}
              className="min-h-0 bg-white"
              data-testid="browser-pane-host"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function BackendBadge({ backend }: { backend: BackendState }) {
  if (backend.status === "online") {
    return (
      <Badge data-testid="backend-status" variant="success">
        <CircleCheck className="h-3.5 w-3.5" />
        Online
      </Badge>
    );
  }
  if (backend.status === "offline") {
    return (
      <Badge data-testid="backend-status" variant="danger">
        <CircleAlert className="h-3.5 w-3.5" />
        Offline
      </Badge>
    );
  }
  return <Badge data-testid="backend-status">Checking</Badge>;
}
