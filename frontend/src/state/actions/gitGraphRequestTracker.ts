import { getCurrentGitGraphProjectConfigId } from "./gitGraphState";

export type GitGraphLogRequest = {
  requestId: number;
  projectConfigId: string | null;
};

let logRequestId = 0;

export function beginGitGraphLogRequest(): GitGraphLogRequest {
  return {
    requestId: (logRequestId += 1),
    projectConfigId: getCurrentGitGraphProjectConfigId(),
  };
}

export function isGitGraphLogRequestCurrent(
  request: GitGraphLogRequest,
): boolean {
  return (
    request.requestId === logRequestId &&
    request.projectConfigId === getCurrentGitGraphProjectConfigId()
  );
}
