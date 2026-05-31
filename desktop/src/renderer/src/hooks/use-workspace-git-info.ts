import { useEffect, useState } from "react";

import type { WorkspaceGitInfo } from "@shared/types";

export type WorkspaceGitState =
  | { status: "idle" }
  | { status: "loading" }
  | { info: WorkspaceGitInfo; status: "ready" }
  | { message: string; status: "error" };

export function useWorkspaceGitInfo(rootPath: string | null): WorkspaceGitState {
  const [state, setState] = useState<WorkspaceGitState>({ status: "idle" });

  useEffect(() => {
    if (!rootPath) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void window.setta.app
      .workspaceGitInfo(rootPath)
      .then((info) => {
        if (!cancelled) {
          setState({ info, status: "ready" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            message: error instanceof Error ? error.message : "Unable to read git metadata",
            status: "error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  return state;
}
