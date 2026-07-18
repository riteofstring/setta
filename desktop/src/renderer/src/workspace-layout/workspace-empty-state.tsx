import type { DesktopPlatform } from "@shared/types";

import type { WorkspaceStatus } from "../stores/workspace-store";
import { workspaceLayoutAreaLabel } from "./workspace-ui-layout";

export function WorkspaceNoWorkspaceState({
  platform,
  status,
}: {
  platform: DesktopPlatform;
  status: WorkspaceStatus;
}) {
  const loading = status === "loading";
  return (
    <section
      aria-label={workspaceLayoutAreaLabel("workspace")}
      className="workspace-layout-area relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-browser-pane-count="0"
      data-desktop-platform={platform}
      data-maximized-pane-id=""
      data-pane-count="0"
      data-presentation-mode="normal"
      data-workspace-id=""
      data-workspace-mode="workspace"
      data-testid="workspace-layout-area"
    >
      <div className="grid h-full min-h-0 place-items-center px-6 text-center">
        <div className="grid max-w-sm gap-2" data-testid="workspace-empty-state">
          <h1 className="text-sm font-semibold text-foreground">
            {loading ? "Loading workspace" : "Open a workspace"}
          </h1>
          <p className="text-xs leading-5 text-muted-foreground">
            {loading
              ? "Loading the active runtime session."
              : "No workspace is open on this runtime."}
          </p>
        </div>
      </div>
    </section>
  );
}
