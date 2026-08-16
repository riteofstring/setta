import {
  PROJECT_CALLABLE_COMPLETIONS_PATH_V1,
  PROJECT_CALLABLE_PATH_V1,
  PROJECT_PARAMETER_PATH_V1,
  PROJECT_PATH_V1,
  type APIErrorCodeV1,
  type CallableCompletionRequestV1,
  type CallableCompletionResponseV1,
  type CommitCallableRequestV1,
  type ProjectSnapshotV1,
  type SetParameterExpressionRequestV1,
} from "./generatedContract";
import {
  ProjectSnapshotValidationError,
  parseCallableCompletionResponseV1,
  parseErrorResponseV1,
  parseProjectSnapshotV1,
} from "./runtimeContract";

type ProjectClientErrorKind = "network" | "http" | "invalid_response";

export class ProjectClientError extends Error {
  public readonly name = "ProjectClientError";

  public constructor(
    public readonly kind: ProjectClientErrorKind,
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
    public readonly code?: APIErrorCodeV1,
  ) {
    super(message);
  }
}

type SetParameterExpressionInput = SetParameterExpressionRequestV1 & {
  parameterId: string;
};

export async function fetchProjectSnapshot(
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV1> {
  return requestProjectSnapshot(
    PROJECT_PATH_V1,
    { headers: { Accept: "application/json" }, method: "GET" },
    fetchImplementation,
  );
}

export async function commitCallable(
  request: CommitCallableRequestV1,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV1> {
  return requestProjectSnapshot(
    PROJECT_CALLABLE_PATH_V1,
    jsonPost(request),
    fetchImplementation,
  );
}

export async function completeCallable(
  request: CallableCompletionRequestV1,
  signal: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<CallableCompletionResponseV1> {
  return requestCallableCompletions(
    PROJECT_CALLABLE_COMPLETIONS_PATH_V1,
    jsonPost(request, signal),
    fetchImplementation,
  );
}

export async function setParameterExpression(
  request: SetParameterExpressionInput,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV1> {
  const { parameterId, ...body } = request;
  return requestProjectSnapshot(
    parameterExpressionPath(parameterId),
    jsonPost(body),
    fetchImplementation,
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

function parameterExpressionPath(parameterId: string): string {
  if (!/^[A-Za-z0-9:_-]+$/u.test(parameterId)) {
    throw new ProjectClientError(
      "invalid_response",
      "Project endpoint returned an unsafe parameter ID.",
    );
  }
  return `${PROJECT_PARAMETER_PATH_V1}${parameterId}`;
}

async function requestProjectSnapshot(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
): Promise<ProjectSnapshotV1> {
  let response: Response;
  try {
    response = await fetchImplementation(path, init);
  } catch (cause) {
    throw new ProjectClientError(
      "network",
      "Unable to reach the project endpoint.",
      undefined,
      cause,
    );
  }

  if (!response.ok) {
    throw await responseError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ProjectClientError(
      "invalid_response",
      "Project endpoint did not return valid JSON.",
      response.status,
      cause,
    );
  }

  try {
    return parseProjectSnapshotV1(payload);
  } catch (cause) {
    if (cause instanceof ProjectSnapshotValidationError) {
      throw new ProjectClientError(
        "invalid_response",
        "Project endpoint returned an invalid V1 snapshot.",
        response.status,
        cause,
      );
    }
    throw cause;
  }
}

async function requestCallableCompletions(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
): Promise<CallableCompletionResponseV1> {
  let response: Response;
  try {
    response = await fetchImplementation(path, init);
  } catch (cause) {
    throw new ProjectClientError(
      "network",
      "Unable to reach the project endpoint.",
      undefined,
      cause,
    );
  }

  if (!response.ok) {
    throw await responseError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ProjectClientError(
      "invalid_response",
      "Project endpoint did not return valid JSON.",
      response.status,
      cause,
    );
  }

  try {
    return parseCallableCompletionResponseV1(payload);
  } catch (cause) {
    if (cause instanceof ProjectSnapshotValidationError) {
      throw new ProjectClientError(
        "invalid_response",
        "Project endpoint returned an invalid callable completion response.",
        response.status,
        cause,
      );
    }
    throw cause;
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
    const failure = parseErrorResponseV1(payload);
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
