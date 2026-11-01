import { describe, expect, it } from "vitest";
import {
  parseWorkspaceClipboardEnvelope,
  serializeWorkspaceClipboardEnvelope,
} from "./envelope.js";
import {
  WORKSPACE_CLIPBOARD_SCHEMA_ID,
  WORKSPACE_CLIPBOARD_SCHEMA_VERSION,
  type WorkspaceClipboardEnvelope,
  type WorkspaceClipboardEnvelopeParseOptions,
} from "./types.js";

function createEnvelope(): WorkspaceClipboardEnvelope {
  return {
    authority: { id: "test-authority", payloadVersion: 3 },
    fragment: {
      roots: ["root"],
      sections: {
        root: {
          children: [],
          id: "root",
          isHorizontalOrientation: false,
          isMinimized: false,
          kind: "leaf",
          name: "Root",
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { height: 80, width: 160 },
          styleColor: null,
          tagColor: null,
        },
      },
      topLevelLayouts: {
        root: { h: 80, w: 160, x: 0, y: 0, zIndex: 0 },
      },
    },
    payload: { sections: { root: { data: { value: "draft" } } } },
    schema: WORKSPACE_CLIPBOARD_SCHEMA_ID,
    version: WORKSPACE_CLIPBOARD_SCHEMA_VERSION,
  };
}

function createOptions(
  overrides: Partial<WorkspaceClipboardEnvelopeParseOptions> = {},
): WorkspaceClipboardEnvelopeParseOptions {
  return {
    authority: { id: "test-authority", payloadVersion: 3 },
    isSectionKindSupported: (kind) => kind === "leaf",
    ...overrides,
  };
}

function serializeEnvelope(envelope: WorkspaceClipboardEnvelope): string {
  const serialized = serializeWorkspaceClipboardEnvelope(envelope);
  if (!serialized.ok) {
    throw new Error("Expected the fixture clipboard envelope to fit.");
  }
  return serialized.text;
}

function parseFixture(value: unknown) {
  return parseWorkspaceClipboardEnvelope(
    JSON.stringify(value),
    createOptions(),
  );
}

describe("workspace clipboard envelope", () => {
  it("round-trips a strict envelope as a detached frozen external value", () => {
    const parsed = parseWorkspaceClipboardEnvelope(
      serializeEnvelope(createEnvelope()),
      createOptions(),
    );

    if (!parsed.ok) {
      throw new Error(`Expected a parsed envelope, received ${parsed.code}.`);
    }
    expect(parsed.envelope.authority).toEqual({
      id: "test-authority",
      payloadVersion: 3,
    });
    expect(Object.isFrozen(parsed.envelope)).toBe(true);
    expect(Object.isFrozen(parsed.envelope.fragment)).toBe(true);
    expect(Object.isFrozen(parsed.envelope.payload)).toBe(true);
    expect(() => {
      (parsed.envelope.fragment.roots as Array<string>).push("injected");
    }).toThrow();
  });

  it("rejects malformed structural, authority, and kind boundaries", () => {
    const envelope = createEnvelope();
    const cycle = {
      ...envelope,
      fragment: {
        ...envelope.fragment,
        sections: {
          root: { ...envelope.fragment.sections.root, children: ["root"] },
        },
      },
    };
    const duplicateRoot = {
      ...envelope,
      fragment: { ...envelope.fragment, roots: ["root", "root"] },
    };
    const wrongAuthority = {
      ...envelope,
      authority: { ...envelope.authority, id: "other-authority" },
    };
    const unknownKind = {
      ...envelope,
      fragment: {
        ...envelope.fragment,
        sections: {
          root: { ...envelope.fragment.sections.root, kind: "unknown" },
        },
      },
    };

    expect(parseFixture({ ...envelope, unexpected: true })).toEqual({
      code: "invalid-envelope",
      ok: false,
    });
    expect(parseFixture(cycle)).toEqual({
      code: "invalid-envelope",
      ok: false,
    });
    expect(parseFixture(duplicateRoot)).toEqual({
      code: "invalid-envelope",
      ok: false,
    });
    expect(parseFixture(wrongAuthority)).toEqual({
      code: "authority-mismatch",
      ok: false,
    });
    expect(parseFixture(unknownKind)).toEqual({
      code: "unknown-section-kind",
      ok: false,
    });
  });

  it("bounds external input before parsing", () => {
    expect(
      parseWorkspaceClipboardEnvelope("{}", createOptions({ maxTextBytes: 1 })),
    ).toEqual({ code: "clipboard-too-large", ok: false });
  });
});
