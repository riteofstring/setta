import {
  BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
  configureAppSubsystemOpenAPI,
  createPolicy,
  createProjectConfig,
  createSingleConfig,
  getAppDefinition,
  setAppDefinition,
  type GetAppDeploymentCurrentSessionResponses,
} from "@setta/app-subsystem-frontend-sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { appSubsystemFrontendRegistration } from "../../../src/index";
import { createStatefulAppSubsystemFrontendHost } from "../../testUtils/appSubsystemTestState";

type AppDeploymentSession = GetAppDeploymentCurrentSessionResponses[200];

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    clear(): void {
      values.clear();
    },
    key(index: number): string | null {
      return Array.from(values.keys())[index] ?? null;
    },
    get length(): number {
      return values.size;
    },
  };
}

function buildAppSessionResponse(): AppDeploymentSession {
  const defaultProject = createProjectConfig({
    id: "project-alpha",
    name: "Alpha",
  });
  return {
    deploymentName: "demo-app",
    deploymentVersion: "v1",
    shareSessionId: "app-session-a",
    sessionRunCount: 1,
    defaultProjectConfigId: defaultProject.id,
    projectMetadata: [defaultProject],
    appPolicy: createPolicy({ allowRun: true }),
    manifest: null,
  };
}

describe("app deployment OpenAPI initialization", () => {
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalFetch = globalThis.fetch;
  const originalLocation = (globalThis as { location?: unknown }).location;
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown })
    .sessionStorage;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const sessionStorageStub = createMemoryStorage();
  const documentStub = { cookie: "" };
  const windowStub = {
    sessionStorage: sessionStorageStub,
  };
  let requests: Request[] = [];

  beforeAll(() => {
    (globalThis as { document?: unknown }).document = documentStub;
    (globalThis as { location?: unknown }).location = {
      origin: "http://localhost",
    };
    (globalThis as { sessionStorage?: Storage }).sessionStorage =
      sessionStorageStub;
    (globalThis as { window?: unknown }).window = windowStub;
  });

  beforeEach(() => {
    requests = [];
    sessionStorageStub.clear();
    documentStub.cookie = "";
    (globalThis as { location: { origin: string } }).location.origin =
      "http://localhost";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/app/deployments/current/session")) {
        return new Response(JSON.stringify(buildAppSessionResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path.endsWith("/app/deployments/demo-app/v1/state")) {
        return new Response(
          JSON.stringify({
            projectState: createSingleConfig({
              projectConfig: createProjectConfig({
                id: "project-alpha",
                name: "Alpha",
              }),
            }),
            appDefinition: null,
            appSpec: null,
            appPolicy: createPolicy({ allowRun: true }),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (path.endsWith("/getAppDefinition")) {
        return new Response(
          JSON.stringify({
            appDefinition: null,
            appSpec: {},
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (path.endsWith("/setAppDefinition")) {
        return new Response(
          JSON.stringify({
            appDefinition: null,
            appSpec: {},
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response("not found", { status: 404 });
    });
    configureAppSubsystemOpenAPI();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sessionStorageStub.clear();
  });

  afterAll(() => {
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = originalDocument;
    }
    if (originalLocation === undefined) {
      delete (globalThis as { location?: unknown }).location;
    } else {
      (globalThis as { location?: unknown }).location = originalLocation;
    }
    if (originalSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else {
      (globalThis as { sessionStorage?: unknown }).sessionStorage =
        originalSessionStorage;
    }
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("sends the current deployment share-session header before the renderer mounts", async () => {
    const frontendHost = createStatefulAppSubsystemFrontendHost();
    const initialize =
      appSubsystemFrontendRegistration.controller
        ?.initializeAppSessionFromCurrentDeployment;
    if (!initialize) {
      throw new Error("app deployment initializer is not registered");
    }

    await expect(initialize(frontendHost)).resolves.toBe(true);

    const stateRequest = requests.find((request) =>
      new URL(request.url).pathname.endsWith(
        "/app/deployments/demo-app/v1/state",
      ),
    );
    expect(stateRequest?.headers.get("X-Share-Session-Id")).toBe(
      "app-session-a",
    );
  });

  it("routes built plugin OpenAPI requests through the backend origin override", async () => {
    (globalThis as { location: { origin: string } }).location.origin =
      "http://127.0.0.1:3019";
    sessionStorageStub.setItem(
      BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
      "http://127.0.0.1:8019",
    );
    configureAppSubsystemOpenAPI();
    const frontendHost = createStatefulAppSubsystemFrontendHost();
    const initialize =
      appSubsystemFrontendRegistration.controller
        ?.initializeAppSessionFromCurrentDeployment;
    if (!initialize) {
      throw new Error("app deployment initializer is not registered");
    }

    await expect(initialize(frontendHost)).resolves.toBe(true);

    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.every(
        (request) =>
          new URL(request.url).origin === "http://127.0.0.1:8019" &&
          new URL(request.url).pathname.startsWith("/api/"),
      ),
    ).toBe(true);
  });

  it("prefixes built plugin app definition OpenAPI routes with the backend API root", async () => {
    (globalThis as { location: { origin: string } }).location.origin =
      "http://127.0.0.1:3019";
    sessionStorageStub.setItem(
      BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
      "http://127.0.0.1:8019",
    );
    configureAppSubsystemOpenAPI();

    await expect(getAppDefinition({ body: {} })).resolves.toMatchObject({
      data: {
        appSpec: {},
      },
    });
    await expect(
      setAppDefinition({ body: { appSpec: {} } }),
    ).resolves.toMatchObject({
      data: {
        appSpec: {},
      },
    });

    expect(requests.map((request) => new URL(request.url).toString())).toEqual([
      "http://127.0.0.1:8019/api/getAppDefinition",
      "http://127.0.0.1:8019/api/setAppDefinition",
    ]);
  });
});
