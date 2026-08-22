import {
  PROJECT_CALLABLES_PATH_V2,
  PROJECT_PATH_V2,
  PROJECT_TARGET_COMPLETIONS_PATH_V2,
  PROJECT_TARGET_PATH_V2,
  projectCallableCommitPath,
  projectCallableCompletionsPath,
  projectCallableDeletePath,
  projectCallableParametersPath,
  projectCallableRefreshParametersPath,
  projectCallableRenamePath,
  type APIErrorCodeV2,
  type CallableCompletionRequestV2,
  type CommitCallableRequestV2,
  type CompletionResponseV2,
  type CreateCallableRequestV2,
  type DeleteCallableRequestV2,
  type ProjectSnapshotV2,
  type PythonTargetCompletionRequestV2,
  type RefreshCallableParametersRequestV2,
  type RenameCallableRequestV2,
  type SetCallableParametersRequestV2,
  type SetPythonTargetRequestV2,
} from "./generatedContract";
import {
  ProjectSnapshotValidationError,
  parseCompletionResponseV2,
  parseErrorResponseV2,
  parseProjectSnapshotV2,
} from "./runtimeContract";

type ProjectClientErrorKind = "network" | "http" | "invalid_response";

export class ProjectClientError extends Error {
  public readonly name = "ProjectClientError";

  public constructor(
    public readonly kind: ProjectClientErrorKind,
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
    public readonly code?: APIErrorCodeV2,
  ) {
    super(message);
  }
}

export async function fetchProjectSnapshot(
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    PROJECT_PATH_V2,
    { headers: { Accept: "application/json" }, method: "GET" },
    fetchImplementation,
  );
}

export function createCallable(
  request: CreateCallableRequestV2,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    PROJECT_CALLABLES_PATH_V2,
    jsonPost(request),
    fetchImplementation,
  );
}

export function renameCallable(
  callableId: string,
  request: RenameCallableRequestV2,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    projectCallableRenamePath(callableId),
    jsonPost(request),
    fetchImplementation,
  );
}

export function deleteCallable(
  callableId: string,
  request: DeleteCallableRequestV2,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    projectCallableDeletePath(callableId),
    jsonPost(request),
    fetchImplementation,
  );
}

export function commitCallable(
  callableId: string,
  request: CommitCallableRequestV2,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    projectCallableCommitPath(callableId),
    jsonPost(request),
    fetchImplementation,
  );
}

export function refreshCallableParameters(
  callableId: string,
  request: RefreshCallableParametersRequestV2,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    projectCallableRefreshParametersPath(callableId),
    jsonPost(request),
    fetchImplementation,
  );
}

export function setCallableParameters(
  callableId: string,
  request: SetCallableParametersRequestV2,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    projectCallableParametersPath(callableId),
    jsonPost(request),
    fetchImplementation,
  );
}

export function setPythonTarget(
  request: SetPythonTargetRequestV2,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV2> {
  return requestProjectSnapshot(
    PROJECT_TARGET_PATH_V2,
    jsonPost(request),
    fetchImplementation,
  );
}

export function completeCallable(
  callableId: string,
  request: CallableCompletionRequestV2,
  signal: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<CompletionResponseV2> {
  return requestCompletions(
    projectCallableCompletionsPath(callableId),
    jsonPost(request, signal),
    fetchImplementation,
    "callable",
  );
}

export function completePythonTarget(
  request: PythonTargetCompletionRequestV2,
  signal: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<CompletionResponseV2> {
  return requestCompletions(
    PROJECT_TARGET_COMPLETIONS_PATH_V2,
    jsonPost(request, signal),
    fetchImplementation,
    "Python target",
  );
}

function jsonPost(body: object, signal?: AbortSignal): RequestInit {
  const request: RequestInit = {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  };
  if (signal !== undefined) {
    request.signal = signal;
  }
  return request;
}

async function requestProjectSnapshot(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
): Promise<ProjectSnapshotV2> {
  const response = await request(path, init, fetchImplementation);
  if (!response.ok) {
    throw await responseError(response);
  }
  const payload = await responseJson(response);
  try {
    return parseProjectSnapshotV2(payload);
  } catch (cause) {
    if (cause instanceof ProjectSnapshotValidationError) {
      throw new ProjectClientError(
        "invalid_response",
        "Project endpoint returned an invalid V2 snapshot.",
        response.status,
        cause,
      );
    }
    throw cause;
  }
}

async function requestCompletions(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
  subject: string,
): Promise<CompletionResponseV2> {
  const response = await request(path, init, fetchImplementation);
  if (!response.ok) {
    throw await responseError(response);
  }
  const payload = await responseJson(response);
  try {
    return parseCompletionResponseV2(payload);
  } catch (cause) {
    if (cause instanceof ProjectSnapshotValidationError) {
      throw new ProjectClientError(
        "invalid_response",
        `Project endpoint returned an invalid ${subject} completion response.`,
        response.status,
        cause,
      );
    }
    throw cause;
  }
}

async function request(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImplementation(path, init);
  } catch (cause) {
    throw new ProjectClientError(
      "network",
      "Unable to reach the project endpoint.",
      undefined,
      cause,
    );
  }
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ProjectClientError(
      "invalid_response",
      "Project endpoint did not return valid JSON.",
      response.status,
      cause,
    );
  }
}

async function responseError(response: Response): Promise<ProjectClientError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    return new ProjectClientError(
      "invalid_response",
      "Project endpoint returned an invalid error response.",
      response.status,
      cause,
    );
  }
  try {
    const failure = parseErrorResponseV2(payload);
    return new ProjectClientError(
      "http",
      failure.error.message,
      response.status,
      undefined,
      failure.error.code,
    );
  } catch (cause) {
    return new ProjectClientError(
      "invalid_response",
      "Project endpoint returned an invalid error response.",
      response.status,
      cause,
    );
  }
}
