import {
  assertKnownFields,
  assertRecord,
  decodeArray,
  decodeBackendEventBase,
  decodeBoolean,
  decodeInteger,
  decodeString,
  requestBackend,
  requireField,
  type BackendFetch,
} from "@shared/backend-runtime";
import { describe, expect, test } from "vitest";

describe("backend runtime decoders", () => {
  test("asserts object payloads", () => {
    const payload = { ok: true };

    expect(assertRecord(payload, "Payload")).toBe(payload);
    expect(() => assertRecord(null, "Payload")).toThrow("Payload must be an object");
    expect(() => assertRecord([], "Payload")).toThrow("Payload must be an object");
  });

  test("rejects unknown and missing fields", () => {
    const record = assertRecord({ extra: true, name: "setta" }, "Payload");

    expect(() => assertKnownFields(record, "Payload", ["name"])).toThrow(
      "Payload contains unknown field extra",
    );
    expect(() => requireField(record, "missing", "Payload")).toThrow("Payload.missing is required");
  });

  test("decodes primitives and arrays", () => {
    expect(decodeBoolean(true, "Payload.ok")).toBe(true);
    expect(decodeInteger(4, "Payload.count")).toBe(4);
    expect(decodeString("ready", "Payload.state")).toBe("ready");
    expect(
      decodeArray(["a", "b"], "Payload.items", (value) => decodeString(value, "Item")),
    ).toEqual(["a", "b"]);

    expect(() => decodeBoolean("true", "Payload.ok")).toThrow("Payload.ok must be a boolean");
    expect(() => decodeInteger(4.5, "Payload.count")).toThrow("Payload.count must be an integer");
    expect(() => decodeString(4, "Payload.state")).toThrow("Payload.state must be a string");
    expect(() => decodeArray("a", "Payload.items", (value) => decodeString(value, "Item"))).toThrow(
      "Payload.items must be an array",
    );
  });

  test("decodes backend event base fields", () => {
    const base = decodeBackendEventBase(
      {
        conversationId: "conversation_api",
        emittedAt: "2026-06-05T20:00:00Z",
        eventId: "event_stream:1",
        payload: {},
        runId: "run_api",
        schemaVersion: 1,
        sequence: 1,
        streamId: "event_stream",
        type: "chat.message.created",
        workspaceId: "workspace_api",
      },
      "ChatMessageCreatedEvent",
      "chat.message.created",
    );

    expect(base).toEqual({
      conversationId: "conversation_api",
      emittedAt: "2026-06-05T20:00:00Z",
      eventId: "event_stream:1",
      runId: "run_api",
      schemaVersion: 1,
      sequence: 1,
      streamId: "event_stream",
      type: "chat.message.created",
      workspaceId: "workspace_api",
    });
  });
});

describe("backend runtime requests", () => {
  test("sends JSON request payloads and decodes success responses", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl: BackendFetch = async (input, init) => {
      calls.push({ init, input });
      return jsonResponse({ ok: true });
    };

    const response = await requestBackend({
      baseURL: "http://127.0.0.1:41000",
      decodeErrorResponse: decodeRuntimeError,
      decodeResponse: decodeOKPayload,
      endpoint: { method: "POST", path: "/payload" },
      fetchImpl,
      requestPayload: { id: "workspace_api" },
    });

    expect(response.ok).toBe(true);
    const call = onlyCall(calls);
    expect(call.input.toString()).toBe("http://127.0.0.1:41000/payload");
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBe(JSON.stringify({ id: "workspace_api" }));
    expect(call.init.headers).toEqual({ "Content-Type": "application/json" });
  });

  test("throws decoded backend error messages", async () => {
    await expect(
      requestBackend({
        baseURL: "http://127.0.0.1:41000",
        decodeErrorResponse: decodeRuntimeError,
        decodeResponse: decodeOKPayload,
        endpoint: { method: "GET", path: "/payload" },
        fetchImpl: async () => jsonResponse({ error: { message: "backend failed" } }, 500),
        requestPayload: undefined,
      }),
    ).rejects.toThrow("backend failed");
  });
});

interface FetchCall {
  init: RequestInit;
  input: URL;
}

interface OKPayload {
  ok: boolean;
}

interface RuntimeErrorPayload {
  error: {
    message: string;
  };
}

function decodeOKPayload(value: unknown): OKPayload {
  const record = assertRecord(value, "OKPayload");
  assertKnownFields(record, "OKPayload", ["ok"]);
  return {
    ok: decodeBoolean(requireField(record, "ok", "OKPayload"), "OKPayload.ok"),
  };
}

function decodeRuntimeError(value: unknown): RuntimeErrorPayload {
  const record = assertRecord(value, "RuntimeErrorPayload");
  assertKnownFields(record, "RuntimeErrorPayload", ["error"]);
  const error = assertRecord(requireField(record, "error", "RuntimeErrorPayload"), "RuntimeError");
  assertKnownFields(error, "RuntimeError", ["message"]);
  return {
    error: {
      message: decodeString(requireField(error, "message", "RuntimeError"), "RuntimeError.message"),
    },
  };
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
