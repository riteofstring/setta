import type {
  CloseWorkspaceRequest,
  ErrorResponse,
  OpenWorkspaceRequest,
  OpenWorkspaceResponse,
  ReorderWorkspaceRequest,
  RemoveRecentWorkspaceRequest,
  SelectWorkspaceRequest,
  WorkspaceSession,
  WorkspaceSummary,
} from "@generated/backend";

export async function fetchWorkspaceSession(baseURL: string): Promise<WorkspaceSession> {
  return requestBackend(baseURL, "/workspace-session", undefined, parseWorkspaceSession);
}

export async function openWorkspace(
  baseURL: string,
  request: OpenWorkspaceRequest,
): Promise<OpenWorkspaceResponse> {
  return requestBackend(
    baseURL,
    "/workspaces/open",
    {
      body: JSON.stringify(request),
      method: "POST",
    },
    parseOpenWorkspaceResponse,
  );
}

export async function selectWorkspace(
  baseURL: string,
  request: SelectWorkspaceRequest,
): Promise<WorkspaceSession> {
  return requestBackend(
    baseURL,
    "/workspaces/select",
    {
      body: JSON.stringify(request),
      method: "POST",
    },
    parseWorkspaceSession,
  );
}

export async function closeWorkspace(
  baseURL: string,
  request: CloseWorkspaceRequest,
): Promise<WorkspaceSession> {
  return requestBackend(
    baseURL,
    "/workspaces/close",
    {
      body: JSON.stringify(request),
      method: "POST",
    },
    parseWorkspaceSession,
  );
}

export async function reorderWorkspaces(
  baseURL: string,
  request: ReorderWorkspaceRequest,
): Promise<WorkspaceSession> {
  return requestBackend(
    baseURL,
    "/workspaces/reorder",
    {
      body: JSON.stringify(request),
      method: "POST",
    },
    parseWorkspaceSession,
  );
}

export async function removeRecentWorkspace(
  baseURL: string,
  request: RemoveRecentWorkspaceRequest,
): Promise<WorkspaceSession> {
  return requestBackend(
    baseURL,
    "/workspaces/remove-recent",
    {
      body: JSON.stringify(request),
      method: "POST",
    },
    parseWorkspaceSession,
  );
}

async function requestBackend<T>(
  baseURL: string,
  path: string,
  init: RequestInit | undefined,
  parse: (value: unknown) => T,
): Promise<T> {
  const response = await fetch(new URL(path, baseURL), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(parseErrorResponse(payload).error.message);
  }
  return parse(payload);
}

function parseOpenWorkspaceResponse(value: unknown): OpenWorkspaceResponse {
  if (!isRecord(value)) {
    throw new Error("open workspace response must be an object");
  }
  return {
    session: parseWorkspaceSession(value.session),
    workspace: parseWorkspaceSummary(value.workspace),
  };
}

function parseWorkspaceSession(value: unknown): WorkspaceSession {
  if (!isRecord(value)) {
    throw new Error("workspace session response must be an object");
  }
  if (typeof value.selectedWorkspaceId !== "string") {
    throw new Error("workspace session selectedWorkspaceId must be a string");
  }
  return {
    activeWorkspaces: parseWorkspaceSummaryArray(
      value.activeWorkspaces,
      "workspace session activeWorkspaces",
    ),
    recentWorkspaces: parseWorkspaceSummaryArray(
      value.recentWorkspaces,
      "workspace session recentWorkspaces",
    ),
    selectedWorkspaceId: value.selectedWorkspaceId,
  };
}

function parseWorkspaceSummaryArray(value: unknown, label: string): WorkspaceSummary[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map(parseWorkspaceSummary);
}

function parseWorkspaceSummary(value: unknown): WorkspaceSummary {
  if (!isRecord(value)) {
    throw new Error("workspace summary must be an object");
  }
  if (typeof value.id !== "string") {
    throw new Error("workspace summary id must be a string");
  }
  if (typeof value.rootPath !== "string") {
    throw new Error("workspace summary rootPath must be a string");
  }
  if (typeof value.displayName !== "string") {
    throw new Error("workspace summary displayName must be a string");
  }
  if (typeof value.lastOpenedAt !== "string") {
    throw new Error("workspace summary lastOpenedAt must be a string");
  }
  return {
    displayName: value.displayName,
    id: value.id,
    lastOpenedAt: value.lastOpenedAt,
    rootPath: value.rootPath,
  };
}

function parseErrorResponse(value: unknown): ErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) {
    throw new Error("backend error response must contain an error object");
  }
  if (typeof value.error.code !== "string") {
    throw new Error("backend error response code must be a string");
  }
  if (typeof value.error.message !== "string") {
    throw new Error("backend error response message must be a string");
  }
  return {
    error: {
      code: value.error.code,
      message: value.error.message,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
