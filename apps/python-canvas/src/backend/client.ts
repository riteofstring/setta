import { PROJECT_PATH_V1, type ProjectSnapshotV1 } from "./generatedContract";
import {
  ProjectSnapshotValidationError,
  parseProjectSnapshotV1,
} from "./runtimeContract";

export type ProjectClientErrorKind =
  | "network"
  | "http"
  | "invalid_response";

export class ProjectClientError extends Error {
  public readonly name = "ProjectClientError";

  public constructor(
    public readonly kind: ProjectClientErrorKind,
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

export async function fetchProjectSnapshot(
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectSnapshotV1> {
  let response: Response;
  try {
    response = await fetchImplementation(PROJECT_PATH_V1, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (cause) {
    throw new ProjectClientError(
      "network",
      "Unable to reach the project endpoint.",
      undefined,
      cause,
    );
  }

  if (!response.ok) {
    throw new ProjectClientError(
      "http",
      `Project endpoint returned HTTP ${response.status}.`,
      response.status,
    );
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
