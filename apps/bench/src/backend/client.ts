import type {
  ApplicationSnapshotV1,
  ImportCandidateRequestV1,
  LaunchRequestV1,
  ProjectDraftV1,
  ProjectV1,
  PutReviewRequestV1,
  ReplaceProjectRequestV1,
} from "./generatedContract";
import {
  validateApplicationSnapshot,
  validateProject,
} from "./contractValidation";

const SNAPSHOT_PATH = "/api/v1/snapshot";
export const SNAPSHOT_EVENTS_PATH = "/api/v1/events";
const PROJECT_PATH = "/api/v1/project";
const LAUNCHES_PATH = "/api/v1/launches";
const REVIEWS_PATH = "/api/v1/reviews";
const CANDIDATE_IMPORT_PATH = "/api/v1/candidates/import";

export class BenchClientError extends Error {
  public constructor(
    public readonly kind:
      "network" | "http" | "invalid-request" | "invalid-response",
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BenchClientError";
  }
}

function assertSnapshot(value: unknown): ApplicationSnapshotV1 {
  if (!validateApplicationSnapshot(value)) {
    throw new BenchClientError(
      "invalid-response",
      "Setta Bench received an invalid application snapshot.",
    );
  }
  return value;
}

function assertProject(value: unknown): ProjectV1 {
  if (!validateProject(value)) {
    throw new BenchClientError(
      "invalid-response",
      "Setta Bench received an invalid project document.",
    );
  }
  return value;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new BenchClientError(
      "invalid-response",
      "Setta Bench received a response that was not JSON.",
      response.status,
      error,
    );
  }
}

async function request(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  try {
    const response = await fetchImplementation(path, init);
    if (!response.ok) {
      throw new BenchClientError(
        "http",
        `Setta Bench request failed with HTTP ${String(response.status)}.`,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof BenchClientError) throw error;
    throw new BenchClientError(
      "network",
      "Setta Bench could not reach the local host.",
      undefined,
      error,
    );
  }
}

async function mutate(
  path: string,
  method: "POST" | "PUT",
  body: object | null,
  fetchImplementation: typeof fetch,
): Promise<void> {
  await request(
    path,
    {
      ...(body === null ? {} : { body: JSON.stringify(body) }),
      headers: {
        Accept: "application/json",
        ...(body === null ? {} : { "Content-Type": "application/json" }),
      },
      method,
    },
    fetchImplementation,
  );
}

export async function fetchSnapshot(
  fetchImplementation: typeof fetch = fetch,
): Promise<ApplicationSnapshotV1> {
  const response = await request(
    SNAPSHOT_PATH,
    { headers: { Accept: "application/json" }, method: "GET" },
    fetchImplementation,
  );
  return assertSnapshot(await readJson(response));
}

export async function replaceProject(
  project: ProjectV1,
  draft: ProjectDraftV1,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectV1> {
  const command: ReplaceProjectRequestV1 = {
    expectedRevision: project.revision,
    project: draft,
    projectId: project.id,
  };
  const response = await request(
    PROJECT_PATH,
    {
      body: JSON.stringify(command),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
    fetchImplementation,
  );
  return assertProject(await readJson(response));
}

export async function launchProject(
  project: ProjectV1,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const command: LaunchRequestV1 = {
    candidateIds: project.candidates.map((candidate) => candidate.id),
    expectedRevision: project.revision,
    projectId: project.id,
  };
  await mutate(LAUNCHES_PATH, "POST", command, fetchImplementation);
}

export async function cancelRun(
  runId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  await mutate(runPath(runId, "cancel"), "POST", null, fetchImplementation);
}

export async function rerun(
  runId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  await mutate(runPath(runId, "rerun"), "POST", null, fetchImplementation);
}

export async function putReview(
  input: PutReviewRequestV1,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  await mutate(REVIEWS_PATH, "PUT", input, fetchImplementation);
}

export async function importCandidate(
  project: ProjectV1,
  bundleDirectory: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProjectV1> {
  const command: ImportCandidateRequestV1 = {
    bundleDirectory,
    expectedRevision: project.revision,
    projectId: project.id,
  };
  const response = await request(
    CANDIDATE_IMPORT_PATH,
    {
      body: JSON.stringify(command),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetchImplementation,
  );
  return assertProject(await readJson(response));
}

function runPath(runId: string, action: "cancel" | "rerun"): string {
  return `/api/v1/runs/${encodeURIComponent(runId)}/${action}`;
}

export function artifactUrl(artifactId: string): string {
  return `/api/v1/artifacts/${encodeURIComponent(artifactId)}`;
}

export type SnapshotEventSource = Pick<
  EventSource,
  "close" | "onerror" | "onmessage"
>;

export function connectSnapshotEvents(
  handlers: {
    onInvalid: (error: unknown) => void;
    onSnapshot: (snapshot: ApplicationSnapshotV1) => void;
  },
  createEventSource: (path: string) => SnapshotEventSource = (path) =>
    new EventSource(path),
): () => void {
  const source = createEventSource(SNAPSHOT_EVENTS_PATH);
  source.onmessage = (event) => {
    try {
      handlers.onSnapshot(assertSnapshot(JSON.parse(event.data)));
    } catch (error) {
      source.close();
      handlers.onInvalid(error);
    }
  };
  source.onerror = () => {};
  return () => source.close();
}
