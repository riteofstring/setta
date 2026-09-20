import {
  isExperimentManifest,
  isExportResult,
  isLensMutation,
  isLensSnapshot,
  isMutationResult,
  isObservationSource,
  isSelectionPacket,
  isSeriesDocument,
  isStructuredError,
  type ExperimentManifest,
  type ExportResult,
  type LensMutation,
  type LensSnapshot,
  type MutationResult,
  type ObservationSource,
  type StructuredError,
} from "./generatedContract";

export const LENS_PATH = "/api/v1/experiment-lens";
export const LENS_APPLY_PATH = "/api/v1/experiment-lens/apply";
export const LENS_EVENTS_PATH = "/api/v1/experiment-lens/events";
const LENS_EXPORT_PATH = "/api/v1/experiment-lens/export";

export class LensClientError extends Error {
  public constructor(
    public readonly kind:
      "network" | "http" | "invalid-request" | "invalid-response",
    message: string,
    public readonly status?: number,
    public readonly structuredError?: StructuredError,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LensClientError";
  }
}

function invalidResponse(message: string, cause?: unknown): LensClientError {
  return new LensClientError(
    "invalid-response",
    message,
    undefined,
    undefined,
    cause,
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw invalidResponse(
      "Experiment Lens received a response that was not JSON.",
      error,
    );
  }
}

async function throwHttpError(response: Response): Promise<never> {
  let payload: unknown;
  let cause: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    cause = error;
  }
  const structuredError = isStructuredError(payload) ? payload : undefined;
  throw new LensClientError(
    "http",
    structuredError?.message ??
      `Experiment Lens request failed with HTTP ${String(response.status)}.`,
    response.status,
    structuredError,
    cause,
  );
}

async function request(
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  try {
    const response = await fetchImplementation(path, init);
    if (!response.ok) {
      await throwHttpError(response);
    }
    return response;
  } catch (error) {
    if (error instanceof LensClientError) {
      throw error;
    }
    throw new LensClientError(
      "network",
      "Experiment Lens could not reach the local host.",
      undefined,
      undefined,
      error,
    );
  }
}

function assertSnapshot(value: unknown): LensSnapshot {
  if (!isLensSnapshot(value) || !snapshotPartsAreValid(value)) {
    throw invalidResponse("Experiment Lens received an invalid snapshot.");
  }
  return value;
}

function snapshotPartsAreValid(snapshot: LensSnapshot): boolean {
  const experiment: ExperimentManifest = snapshot.experiment;
  const observationSource: ObservationSource = {
    experimentId: experiment.id,
    observations: snapshot.observations,
    version: 1,
  };
  return (
    isExperimentManifest(experiment) &&
    isObservationSource(observationSource) &&
    snapshot.artifacts.every(
      (artifact) =>
        artifact.status !== "resolved" ||
        artifact.content.kind !== "series" ||
        isSeriesDocument(artifact.content.series),
    )
  );
}

function assertMutationResult(
  value: unknown,
  mutation: LensMutation,
): MutationResult {
  if (
    !isMutationResult(value) ||
    value.snapshot.experiment.id !== mutation.experimentId ||
    value.snapshot.manifestSha256 !== mutation.manifestSha256 ||
    value.snapshot.observationSourceSha256 !==
      mutation.observationSourceSha256 ||
    value.snapshot.revision !== mutation.expectedRevision + 1
  ) {
    throw invalidResponse(
      "Experiment Lens received an invalid mutation result.",
    );
  }
  return value as MutationResult;
}

function assertExportResult(value: unknown): ExportResult {
  if (!isExportResult(value) || !isSelectionPacket(value.packet)) {
    throw invalidResponse("Experiment Lens received an invalid export result.");
  }
  return value as ExportResult;
}

export async function fetchLensSnapshot(
  fetchImplementation: typeof fetch = fetch,
): Promise<LensSnapshot> {
  const response = await request(
    LENS_PATH,
    { headers: { Accept: "application/json" }, method: "GET" },
    fetchImplementation,
  );
  return assertSnapshot(await readJson(response));
}

export async function applyLensMutation(
  mutation: LensMutation,
  fetchImplementation: typeof fetch = fetch,
): Promise<MutationResult> {
  if (!isLensMutation(mutation)) {
    throw new LensClientError(
      "invalid-request",
      "Experiment Lens generated an invalid mutation.",
    );
  }
  const response = await request(
    LENS_APPLY_PATH,
    {
      body: JSON.stringify(mutation),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
    fetchImplementation,
  );
  return assertMutationResult(await readJson(response), mutation);
}

export async function exportLensSelection(
  fetchImplementation: typeof fetch = fetch,
): Promise<ExportResult> {
  const response = await request(
    LENS_EXPORT_PATH,
    { headers: { Accept: "application/json" }, method: "GET" },
    fetchImplementation,
  );
  return assertExportResult(await readJson(response));
}

export type LensEventSource = {
  addEventListener(type: string, listener: EventListener): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
  removeEventListener(type: string, listener: EventListener): void;
};

export function subscribeLensSnapshots(
  handlers: {
    onError?: (event: Event) => void;
    onInvalid: (error: unknown) => void;
    onSnapshot: (snapshot: LensSnapshot) => void;
  },
  createEventSource: (path: string) => LensEventSource = (path) =>
    new EventSource(path),
): () => void {
  const source = createEventSource(LENS_EVENTS_PATH);
  const listener: EventListener = (event) => {
    let snapshot: LensSnapshot;
    try {
      snapshot = assertSnapshot(
        JSON.parse(String((event as MessageEvent).data)),
      );
    } catch (error) {
      source.removeEventListener("snapshot", listener);
      source.close();
      handlers.onInvalid(error);
      return;
    }
    handlers.onSnapshot(snapshot);
  };
  source.addEventListener("snapshot", listener);
  source.onerror = (event) => handlers.onError?.(event);
  return () => {
    source.removeEventListener("snapshot", listener);
    source.close();
  };
}
