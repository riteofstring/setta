import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  getItemHandlerRegistration,
  registerItemHandlers,
} from "./itemHandlerRegistry";

describe("item handler registration", () => {
  let host: WorkspaceHost;

  beforeEach(() => {
    host = createWorkspaceHost();
  });

  afterEach(() => host.dispose());

  it("replaces handlers keyed by section and stable item id", () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    registerItemHandlers(host, [
      {
        sectionId: "panel",
        itemId: "dropzone",
        kind: "dropzone",
        onAccepted,
        onRejected,
      },
      {
        sectionId: "panel",
        itemId: "password",
        kind: "password",
        onRevealSavedValue: vi.fn(),
      },
    ]);
    expect(getItemHandlerRegistration(host, "panel", "dropzone")).toMatchObject({
      kind: "dropzone",
      onAccepted,
      onRejected,
    });
    expect(getItemHandlerRegistration(host, "other-panel", "dropzone")).toBeNull();

    registerItemHandlers(host, []);
    expect(getItemHandlerRegistration(host, "panel", "dropzone")).toBeNull();
  });

  it("rejects duplicate identities and malformed handlers", () => {
    const registration = {
      sectionId: "panel",
      itemId: "dropzone",
      kind: "dropzone" as const,
      onAccepted: vi.fn(),
      onRejected: vi.fn(),
    };
    expect(() =>
      registerItemHandlers(host, [registration, registration]),
    ).toThrowError("Duplicate item handler registration for panel/dropzone.");
    expect(() =>
      registerItemHandlers(host, [
        {
          ...registration,
          onAccepted: null,
        } as never,
      ]),
    ).toThrowError(
      "Item handler panel/dropzone onAccepted must be a function.",
    );
    expect(() => registerItemHandlers(host, null as never)).toThrowError(
      "Item handler registrations must be an array.",
    );
    expect(() =>
      registerItemHandlers(host, [
        {
          sectionId: "panel",
          itemId: "dropzone",
          kind: "upload",
        } as never,
      ]),
    ).toThrowError(
      "Item handler panel/dropzone names the unknown handler kind upload.",
    );
  });
});
