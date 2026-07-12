import { createBackendClient, type WorkspaceSession } from "@generated/backend";
import { describe, expect, test } from "vitest";

describe("generated backend client", () => {
  test("decodes success responses", async () => {
    const session = workspaceSession();
    const client = createBackendClient("http://127.0.0.1:41000", async () =>
      jsonResponse({ session, workspace: session.activeWorkspaces[0] }),
    );

    const response = await client.openWorkspace({ rootPath: "/tmp/api" });

    expect(response.session).toEqual(session);
    expect(response.workspace.id).toBe("workspace_api");
  });

  test("throws backend error messages", async () => {
    const client = createBackendClient("http://127.0.0.1:41000", async () =>
      jsonResponse(
        {
          error: {
            activeExecution: null,
            code: "select_workspace_failed",
            message: "workspace is not active: workspace_missing",
            operationApplied: false,
          },
        },
        400,
      ),
    );

    await expect(client.selectWorkspace({ id: "workspace_missing" })).rejects.toThrow(
      "workspace is not active: workspace_missing",
    );
  });

  test("fails loudly for malformed success responses", async () => {
    const client = createBackendClient("http://127.0.0.1:41000", async () =>
      jsonResponse({
        activeWorkspaces: "not an array",
        recentWorkspaces: [],
        selectedWorkspaceId: "",
      }),
    );

    await expect(client.workspaceSession()).rejects.toThrow(
      "WorkspaceSession.activeWorkspaces must be an array",
    );
  });

  test("rejects unknown response fields", async () => {
    const client = createBackendClient("http://127.0.0.1:41000", async () =>
      jsonResponse({
        extra: true,
        name: "setta-backend",
        ok: true,
        version: "test",
      }),
    );

    await expect(client.backendHealth()).rejects.toThrow(
      "BackendHealth contains unknown field extra",
    );
  });

  test("decodes inactive chat run responses", async () => {
    const client = createBackendClient("http://127.0.0.1:41000", async () =>
      jsonResponse({
        hasActiveRun: false,
        liveness: null,
        run: null,
      }),
    );

    const response = await client.getActiveRun({
      conversationId: "conversation_api",
      workspaceId: "workspace_api",
    });

    expect(response.hasActiveRun).toBe(false);
    expect(response.run).toBeNull();
  });

  test("GET endpoints do not send JSON bodies", async () => {
    const calls: FetchCall[] = [];
    const client = createBackendClient("http://127.0.0.1:41000", async (input, init) => {
      calls.push({ init, input });
      return jsonResponse(workspaceSession());
    });

    await client.workspaceSession();

    const call = onlyCall(calls);
    expect(call.input.toString()).toBe("http://127.0.0.1:41000/workspace-session");
    expect(call.init.method).toBe("GET");
    expect(call.init.body).toBeUndefined();
    expect(call.init.headers).toBeUndefined();
  });

  test("POST endpoints send request payloads as JSON", async () => {
    const calls: FetchCall[] = [];
    const client = createBackendClient("http://127.0.0.1:41000", async (input, init) => {
      calls.push({ init, input });
      return jsonResponse(workspaceSession());
    });

    await client.reorderWorkspace({ ids: ["workspace_web", "workspace_api"] });

    const call = onlyCall(calls);
    expect(call.input.toString()).toBe("http://127.0.0.1:41000/workspaces/reorder");
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBe(JSON.stringify({ ids: ["workspace_web", "workspace_api"] }));
    expect(call.init.headers).toEqual({ "Content-Type": "application/json" });
  });
});

interface FetchCall {
  init: RequestInit;
  input: URL;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function onlyCall(calls: FetchCall[]): FetchCall {
  const call = calls[0];
  if (!call) {
    throw new Error("expected fetch call");
  }
  expect(calls).toHaveLength(1);
  return call;
}

function workspaceSession(): WorkspaceSession {
  return {
    activeWorkspaces: [
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-05-29T20:00:00Z",
        rootPath: "/tmp/api",
      },
    ],
    recentWorkspaces: [
      {
        displayName: "api",
        id: "workspace_api",
        lastOpenedAt: "2026-05-29T20:00:00Z",
        rootPath: "/tmp/api",
      },
    ],
    selectedWorkspaceId: "workspace_api",
  };
}
