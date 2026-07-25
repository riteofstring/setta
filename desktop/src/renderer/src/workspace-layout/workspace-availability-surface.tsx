import type { DesktopPlatform } from "@shared/types";

import {
  type WorkspaceStatus,
  workspaceAvailability,
  useWorkspaceStore,
} from "../stores/workspace-store";
import { WorkspaceNoWorkspaceState } from "./workspace-empty-state";
import { WorkspaceUnavailableNotice } from "./workspace-layout-area-components";

export function WorkspaceFirstRunSurface({
  platform,
  status,
}: {
  platform: DesktopPlatform;
  status: WorkspaceStatus;
}) {
  const openLocalFolder = useWorkspaceStore((state) => state.openLocalFolder);
  const operation = useWorkspaceStore((state) => state.operation);
  const error = useWorkspaceStore((state) => state.error);
  return (
    <WorkspaceNoWorkspaceState
      busy={operation !== null || status === "loading"}
      error={error}
      onChooseFolder={() => void openLocalFolder()}
      platform={platform}
      status={status}
    />
  );
}

export function WorkspaceAvailabilityNotice({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const session = useWorkspaceStore((state) => state.session);
  const operation = useWorkspaceStore((state) => state.operation);
  const status = useWorkspaceStore((state) => state.status);
  const error = useWorkspaceStore((state) => state.error);
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const refreshWorkspaceAvailability = useWorkspaceStore(
    (state) => state.refreshWorkspaceAvailability,
  );
  const relocateWorkspace = useWorkspaceStore((state) => state.relocateWorkspace);
  const availability = workspaceAvailability(session, workspaceId);
  if (!availability || availability.available) {
    return null;
  }
  return (
    <WorkspaceUnavailableNotice
      busy={operation !== null || status === "loading"}
      error={error}
      onClose={() => void closeWorkspace(workspaceId)}
      onLocate={() => void relocateWorkspace(workspaceId)}
      onRetry={() => void refreshWorkspaceAvailability(workspaceId)}
      reason={availability.unavailableReason}
      workspaceName={workspaceName}
    />
  );
}
