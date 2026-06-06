import type { WorkspaceSummary } from "@generated/backend";
import { FolderOpen } from "lucide-react";

import type {
  WorkspaceOperation,
  WorkspaceOperationKind,
  WorkspaceStatus,
} from "../stores/workspace-store";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function WorkspacePanel({
  error,
  openLocalFolder,
  operation,
  selectedWorkspace,
  status,
}: {
  error: string | null;
  openLocalFolder: () => Promise<void>;
  operation: WorkspaceOperation;
  selectedWorkspace: WorkspaceSummary | null;
  status: WorkspaceStatus;
}) {
  const busy = operation !== null || status === "loading";
  return (
    <div id="workspace" className="border-b border-border bg-card p-2">
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-foreground">Workspace</h2>
            {status === "loading" ? <Badge variant="neutral">Loading</Badge> : null}
            {operation ? <Badge variant="neutral">{operationLabel(operation)}</Badge> : null}
          </div>
          {selectedWorkspace ? (
            <div className="mt-3 min-w-0">
              <div className="truncate text-xs font-semibold">{selectedWorkspace.displayName}</div>
              <div
                className="mt-1 truncate text-xs text-muted-foreground"
                data-testid="selected-workspace-path"
              >
                {selectedWorkspace.rootPath}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-xs font-semibold">No workspace open</div>
              <Button
                className="mt-2 h-7 rounded-sm px-2 text-xs"
                disabled={busy}
                onClick={() => void openLocalFolder()}
                variant="primary"
              >
                <FolderOpen className="h-4 w-4" />
                Open Folder
              </Button>
            </div>
          )}
          {error ? (
            <div
              className="mt-2 max-w-3xl rounded-sm border border-border bg-card px-2 py-1.5 text-xs text-foreground"
              data-testid="workspace-error"
            >
              {error}
            </div>
          ) : null}
        </div>
        <Badge variant={selectedWorkspace ? "success" : "neutral"}>
          {selectedWorkspace ? "Active" : "Empty"}
        </Badge>
      </div>
    </div>
  );
}

const operationLabels = {
  closing: "Closing",
  opening: "Opening",
  removingRecent: "Removing",
  reordering: "Reordering",
  selecting: "Selecting",
} satisfies Record<WorkspaceOperationKind, string>;

function operationLabel(operation: WorkspaceOperationKind) {
  return operationLabels[operation];
}
