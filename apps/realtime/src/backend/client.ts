import {
  type ContentReference,
  type Project,
  type RuntimeEnvelope,
  type RuntimeCommand,
  validateContentReference,
  validateProject,
  validateRuntimeEnvelope,
  validateRuntimeCommand,
} from "./generatedContract";

export const PROJECT_PATH = "/api/v1/project";
const PROJECT_APPLY_PATH = "/api/v1/project/apply";
export const PROJECT_EVENTS_PATH = "/api/v1/project/events";
export const RUNTIME_PATH = "/api/v1/runtime";
export const CONTENT_PATH = "/api/v1/content";

export class RealtimeClientError extends Error {
  public constructor(
    public readonly kind: "network" | "http" | "invalid-response",
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RealtimeClientError";
  }
}

function assertProject(value: unknown): Project {
  if (!validateProject(value)) {
    throw new RealtimeClientError(
      "invalid-response",
      "Realtime received an invalid project document.",
    );
  }
  return value as Project;
}

function assertRuntimeEnvelope(value: unknown): RuntimeEnvelope {
  if (!validateRuntimeEnvelope(value)) {
    throw new RealtimeClientError(
      "invalid-response",
      "Realtime received an invalid runtime envelope.",
    );
  }
  return value as RuntimeEnvelope;
}

function assertContentReference(value: unknown): ContentReference {
  if (!validateContentReference(value)) {
    throw new RealtimeClientError(
      "invalid-response",
      "Realtime received an invalid content reference.",
    );
  }
  return value as ContentReference;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new RealtimeClientError(
      "invalid-response",
      "Realtime received a response that was not JSON.",
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
      throw new RealtimeClientError(
        "http",
        `Realtime request failed with HTTP ${String(response.status)}.`,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof RealtimeClientError) {
      throw error;
    }
    throw new RealtimeClientError(
      "network",
      "Realtime could not reach the local host.",
      undefined,
      error,
    );
  }
}

export async function fetchProject(
  fetchImplementation: typeof fetch = fetch,
): Promise<Project> {
  const response = await request(
    PROJECT_PATH,
    { headers: { Accept: "application/json" }, method: "GET" },
    fetchImplementation,
  );
  return assertProject(await readJson(response));
}

export async function applyProject(
  project: Project,
  operations: ReadonlyArray<unknown>,
  fetchImplementation: typeof fetch = fetch,
): Promise<Project> {
  const response = await request(
    PROJECT_APPLY_PATH,
    {
      body: JSON.stringify({
        expectedRevision: project.revision,
        operations,
        projectId: project.id,
      }),
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

export type ProjectEventSource = Pick<
  EventSource,
  "close" | "onerror" | "onmessage"
>;

export function connectProjectEvents(
  handlers: {
    onInvalid: (error: unknown) => void;
    onProject: (project: Project) => void;
  },
  createEventSource: (path: string) => ProjectEventSource = (path) =>
    new EventSource(path),
): () => void {
  const source = createEventSource(PROJECT_EVENTS_PATH);
  source.onmessage = (event) => {
    try {
      handlers.onProject(assertProject(JSON.parse(event.data)));
    } catch (error) {
      source.close();
      handlers.onInvalid(error);
    }
  };
  source.onerror = () => {};
  return () => source.close();
}

export type RuntimeSocket = Pick<
  WebSocket,
  | "close"
  | "onclose"
  | "onerror"
  | "onmessage"
  | "onopen"
  | "readyState"
  | "send"
>;

function runtimeWebSocketUrl(locationImplementation: Location): string {
  const url = new URL(RUNTIME_PATH, locationImplementation.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

export function connectRuntime(
  handlers: {
    onClose: () => void;
    onEnvelope: (envelope: RuntimeEnvelope) => void;
    onInvalid: (error: unknown) => void;
    onOpen: () => void;
  },
  createSocket: (url: string) => RuntimeSocket = (url) => new WebSocket(url),
  locationImplementation: Location = window.location,
): { close: () => void; send: (event: RuntimeCommand) => boolean } {
  const socket = createSocket(runtimeWebSocketUrl(locationImplementation));
  socket.onopen = handlers.onOpen;
  socket.onclose = handlers.onClose;
  socket.onerror = () => {};
  socket.onmessage = (event) => {
    try {
      handlers.onEnvelope(
        assertRuntimeEnvelope(JSON.parse(String(event.data))),
      );
    } catch (error) {
      handlers.onInvalid(error);
      socket.close();
    }
  };
  return {
    close: () => socket.close(),
    send: (event) => {
      if (socket.readyState !== 1 || !validateRuntimeCommand(event)) {
        return false;
      }
      socket.send(JSON.stringify(event));
      return true;
    },
  };
}

export async function uploadContent(
  content: Blob,
  invocationId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<ContentReference> {
  const response = await request(
    CONTENT_PATH,
    {
      body: content,
      headers: {
        Accept: "application/json",
        "Content-Type": content.type,
        "X-Setta-Invocation-ID": invocationId,
      },
      method: "POST",
    },
    fetchImplementation,
  );
  const reference = assertContentReference(await readJson(response));
  if (reference.invocationId !== invocationId) {
    throw new RealtimeClientError(
      "invalid-response",
      "Realtime received a content reference for another invocation.",
    );
  }
  return reference;
}

export function contentUrl(reference: Pick<ContentReference, "id">): string {
  return `${CONTENT_PATH}/${encodeURIComponent(reference.id)}`;
}
