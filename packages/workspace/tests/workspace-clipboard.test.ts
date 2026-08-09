import { describe, expect, it, vi } from "vitest";

import {
  WORKSPACE_CLIPBOARD_MIME_TYPE,
  WORKSPACE_CLIPBOARD_SCHEMA_VERSION,
  WORKSPACE_DEFAULT_CAPABILITIES,
  createWorkspaceJsonClipboardAdapter,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import { applyWorkspaceDocumentCommand } from "../src/internal/document-commands.js";
import {
  materializeWorkspaceClipboardClone,
  placeWorkspaceClipboardSections,
  prepareWorkspaceClipboardCopy,
  readWorkspaceClipboardItem,
  resolveWorkspaceClipboardShortcut,
  workspaceClipboardCloneRequest,
  workspaceClipboardFrameDocument,
} from "../src/internal/workspace-clipboard.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function recursiveClipboardDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "root", title: "Root" },
    { id: "child", title: "Child" },
    { id: "peer", title: "Peer" },
  ]);
  const root = flat.sections.root as WorkspaceSection;
  const child = flat.sections.child as WorkspaceSection;
  return {
    ...flat,
    rootSections: [
      { position: { x: 40, y: 60 }, sectionId: "root" },
      { position: { x: 420, y: 100 }, sectionId: "peer" },
    ],
    sections: {
      ...flat.sections,
      child: { ...child, data: { source: "child" } },
      root: {
        ...root,
        childLayout: {
          overflow: "grow",
          positioning: "freeform",
          positions: { child: { x: 24, y: 36 } },
          sectionIds: ["child"],
        },
        data: { source: "root" },
      },
    },
  };
}

function preparedClipboard() {
  const document = recursiveClipboardDocument();
  const prepared = prepareWorkspaceClipboardCopy(document, ["child", "root"], (sectionId) =>
    sectionId === "root" ? { height: 360, width: 300, x: 40, y: 60 } : undefined,
  );
  if (prepared.status !== "ready") throw new Error("Expected a prepared clipboard frame.");
  const read = readWorkspaceClipboardItem(prepared.item);
  if (read.status !== "ready") throw new Error("Expected a readable clipboard frame.");
  return { document, frame: read.frame, prepared };
}

function acceptedClone(frame: ReturnType<typeof preparedClipboard>["frame"]) {
  const request = workspaceClipboardCloneRequest(frame);
  return {
    allowed: true,
    sections: request.sections.map((section) => ({
      data: structuredClone(section.data),
      id: `copy-${section.id}`,
      sourceSectionId: section.id,
    })),
  } as const;
}

function measuredRoot(document: WorkspaceDocument, sectionId: string) {
  const root = document.rootSections.find((candidate) => candidate.sectionId === sectionId);
  if (!root) throw new Error(`Expected root section ${sectionId}.`);
  return { height: 180, width: 240, ...root.position };
}

function placedClipboardBlock(document: WorkspaceDocument) {
  const prepared = prepareWorkspaceClipboardCopy(document, ["alpha", "beta"], (sectionId) =>
    measuredRoot(document, sectionId),
  );
  if (prepared.status !== "ready") throw new Error("Expected a prepared block.");
  const read = readWorkspaceClipboardItem(prepared.item);
  if (read.status !== "ready") throw new Error("Expected a readable block.");
  const request = workspaceClipboardCloneRequest(read.frame);
  const materialized = materializeWorkspaceClipboardClone(
    read.frame,
    {
      allowed: true,
      sections: request.sections.map((section) => ({
        data: section.data,
        id: `pasted-${section.id}`,
        sourceSectionId: section.id,
      })),
    },
    new Set(Object.keys(document.sections)),
  );
  if (materialized.status !== "ready") throw new Error("Expected a materialized block.");
  return placeWorkspaceClipboardSections(materialized.paste, {
    destination: {
      parentId: null,
      placement: { position: { x: 40, y: 40 }, type: "freeform" },
    },
    existingRects: document.rootSections.map((root) => ({
      height: 180,
      width: 240,
      ...root.position,
    })),
    grid: [24, 24],
  });
}

describe("workspace clipboard framing", () => {
  it("normalizes selected roots and extracts their complete subtree with measured geometry", () => {
    const { frame, prepared } = preparedClipboard();
    const extracted = workspaceClipboardFrameDocument(frame);

    expect(prepared).toMatchObject({ rootCount: 1, sectionCount: 2, status: "ready" });
    expect(prepared.item.mimeType).toBe(WORKSPACE_CLIPBOARD_MIME_TYPE);
    expect(extracted.rootSections).toEqual([{ position: { x: 0, y: 0 }, sectionId: "root" }]);
    expect(Object.keys(extracted.sections)).toEqual(["root", "child"]);
    expect(extracted.sections.root?.childLayout?.sectionIds).toEqual(["child"]);
    expect(extracted.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("fails specifically for an empty selection or unavailable selected-root geometry", () => {
    const document = recursiveClipboardDocument();

    expect(prepareWorkspaceClipboardCopy(document, [], () => undefined)).toEqual({
      reason: "clipboard-selection-empty",
      status: "rejected",
    });
    expect(prepareWorkspaceClipboardCopy(document, ["root"], () => undefined)).toEqual({
      reason: "section-geometry-unavailable",
      status: "rejected",
    });
  });

  it("rejects unsupported MIME, versions, malformed containment, and accessor-backed items", () => {
    const { prepared } = preparedClipboard();
    const parsed = JSON.parse(prepared.item.serialized) as Record<string, unknown>;
    const unsupported = JSON.stringify({
      ...parsed,
      schemaVersion: WORKSPACE_CLIPBOARD_SCHEMA_VERSION + 1,
    });
    const malformed = structuredClone(parsed) as {
      sections: Record<string, { childLayout: { sectionIds: string[] } }>;
    };
    const malformedRoot = malformed.sections.root;
    if (!malformedRoot) throw new Error("Expected the malformed root fixture.");
    malformedRoot.childLayout.sectionIds = ["missing"];
    let evaluated = false;
    const accessorItem = Object.defineProperty(
      { mimeType: WORKSPACE_CLIPBOARD_MIME_TYPE },
      "serialized",
      {
        enumerable: true,
        get: () => {
          evaluated = true;
          return prepared.item.serialized;
        },
      },
    );

    expect(readWorkspaceClipboardItem({ ...prepared.item, mimeType: "text/plain" })).toMatchObject({
      reason: "clipboard-format-unsupported",
      status: "rejected",
    });
    expect(readWorkspaceClipboardItem({ ...prepared.item, serialized: unsupported })).toMatchObject(
      { reason: "clipboard-version-unsupported", status: "rejected" },
    );
    expect(
      readWorkspaceClipboardItem({
        ...prepared.item,
        serialized: JSON.stringify(malformed),
      }),
    ).toMatchObject({ reason: "clipboard-invalid", status: "rejected" });
    expect(readWorkspaceClipboardItem(accessorItem)).toMatchObject({
      reason: "clipboard-invalid",
      status: "rejected",
    });
    expect(evaluated).toBe(false);
  });
});

describe("workspace clipboard host cloning", () => {
  it("uses the JSON adapter only after host validation and structured-clones accepted data", async () => {
    const { frame } = preparedClipboard();
    let clipboardText = "";
    const validateSectionData = vi.fn(() => true);
    const adapter = createWorkspaceJsonClipboardAdapter({
      allocateSectionId: ({ sourceSectionId }) => `json-${sourceSectionId}`,
      clipboard: {
        readText: async () => clipboardText,
        writeText: async (value) => {
          clipboardText = value;
        },
      },
      validateSectionData,
    });
    const request = workspaceClipboardCloneRequest(frame);
    const decision = await adapter.cloneSections(request);

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("Expected the JSON adapter to accept the source.");
    expect(decision.sections.map(({ id }) => id)).toEqual(["json-root", "json-child"]);
    expect(decision.sections[0]?.data).toEqual(request.sections[0]?.data);
    expect(decision.sections[0]?.data).not.toBe(request.sections[0]?.data);
    expect(validateSectionData).toHaveBeenCalledTimes(2);

    await adapter.write({
      mimeType: WORKSPACE_CLIPBOARD_MIME_TYPE,
      serialized: "serialized workspace sections",
    });
    expect(await adapter.read()).toEqual({
      mimeType: WORKSPACE_CLIPBOARD_MIME_TYPE,
      serialized: "serialized workspace sections",
    });
  });

  it("returns one rejection and no clone when any JSON payload is not host-valid", async () => {
    const { frame } = preparedClipboard();
    const allocateSectionId = vi.fn(
      ({ sourceSectionId }: { sourceSectionId: string }) => sourceSectionId,
    );
    const adapter = createWorkspaceJsonClipboardAdapter({
      allocateSectionId,
      clipboard: { readText: async () => "", writeText: async () => undefined },
      validateSectionData: ({ sourceSectionId }) => sourceSectionId !== "child",
    });

    expect(await adapter.cloneSections(workspaceClipboardCloneRequest(frame))).toEqual({
      allowed: false,
      code: "invalid",
      reason: 'Section "child" has data this host cannot clone.',
    });
    expect(allocateSectionId).not.toHaveBeenCalled();
    await expect(adapter.read()).resolves.toBeNull();
  });

  it("remaps every ID and child reference atomically while rejecting partial or colliding clones", () => {
    const { frame } = preparedClipboard();
    const decision = acceptedClone(frame);
    const materialized = materializeWorkspaceClipboardClone(frame, decision, new Set(["existing"]));

    expect(materialized.status).toBe("ready");
    if (materialized.status !== "ready") throw new Error("Expected a complete clone.");
    expect(materialized.paste.roots.map(({ sectionId }) => sectionId)).toEqual(["copy-root"]);
    expect(materialized.paste.sections["copy-root"]?.childLayout?.sectionIds).toEqual([
      "copy-child",
    ]);
    expect(materialized.paste.sections["copy-root"]?.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: { "copy-child": { x: 24, y: 36 } },
      sectionIds: ["copy-child"],
    });
    expect(Object.keys(materialized.paste.sections)).toEqual(["copy-root", "copy-child"]);

    expect(
      materializeWorkspaceClipboardClone(
        frame,
        { ...decision, sections: decision.sections.slice(0, 1) },
        new Set(),
      ),
    ).toMatchObject({ reason: "clipboard-clone-partial", status: "rejected" });
    expect(
      materializeWorkspaceClipboardClone(frame, decision, new Set(["copy-child"])),
    ).toMatchObject({ reason: "section-id-exists", status: "rejected" });
    expect(
      materializeWorkspaceClipboardClone(
        frame,
        { allowed: false, code: "unauthorized", reason: "Policy denied the clone." },
        new Set(),
      ),
    ).toEqual({
      detail: "Policy denied the clone.",
      reason: "clipboard-unauthorized",
      status: "rejected",
    });
  });
});

describe("workspace clipboard placement and command", () => {
  it("smart-places the root block without overlap, preserves offsets, and snaps its origin", () => {
    const document = createWorkspaceTestDocument([
      { id: "alpha", title: "Alpha" },
      { id: "beta", title: "Beta" },
    ]);
    const placed = placedClipboardBlock(document);
    const placement = placed.destination.placement;
    if (placement.type !== "freeform") throw new Error("Expected a freeform paste placement.");
    const firstPosition = placement.positions[placed.rootSectionIds[0] as string];
    const secondPosition = placement.positions[placed.rootSectionIds[1] as string];
    if (!firstPosition || !secondPosition) throw new Error("Expected two placed roots.");

    expect(firstPosition.x % 24).toBe(0);
    expect(firstPosition.y % 24).toBe(0);
    expect(secondPosition.x - firstPosition.x).toBe(280);
    const result = applyWorkspaceDocumentCommand(
      document,
      { paste: placed, type: "paste-sections" },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );
    expect(result).toMatchObject({ reason: "section-paste", status: "applied" });
    if (result.status !== "applied") throw new Error("Expected one applied paste command.");
    expect(result.document.rootSections).toHaveLength(4);
    expect(Object.keys(result.document.sections)).toHaveLength(4);
    expect(
      applyWorkspaceDocumentCommand(
        document,
        { paste: placed, type: "paste-sections" },
        { ...WORKSPACE_DEFAULT_CAPABILITIES, editStructure: false },
      ),
    ).toMatchObject({ reason: "structure-edit-disabled", status: "rejected" });
  });

  it("inserts a pasted block into ordered or freeform nested destinations atomically", () => {
    const source = createWorkspaceTestDocument([
      { id: "alpha", title: "Alpha" },
      { id: "beta", title: "Beta" },
    ]);
    const placed = placedClipboardBlock(source);
    const document = recursiveClipboardDocument();
    const [firstId, secondId] = placed.rootSectionIds;
    if (!firstId || !secondId) throw new Error("Expected two pasted roots.");
    const freeformPaste = {
      ...placed,
      destination: {
        parentId: "root",
        placement: {
          positions: {
            [firstId]: { x: 48, y: 72 },
            [secondId]: { x: 336, y: 96 },
          },
          type: "freeform" as const,
        },
      },
    };
    const freeformResult = applyWorkspaceDocumentCommand(
      document,
      { paste: freeformPaste, type: "paste-sections" },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );
    expect(freeformResult).toMatchObject({ reason: "section-paste", status: "applied" });
    if (freeformResult.status !== "applied") throw new Error("Expected a nested freeform paste.");
    expect(freeformResult.document.rootSections).toEqual(document.rootSections);
    expect(freeformResult.document.sections.root?.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: {
        child: { x: 24, y: 36 },
        [firstId]: { x: 48, y: 72 },
        [secondId]: { x: 336, y: 96 },
      },
      sectionIds: ["child", firstId, secondId],
    });

    const root = document.sections.root as WorkspaceSection;
    const orderedDocument: WorkspaceDocument = {
      ...document,
      sections: {
        ...document.sections,
        root: {
          ...root,
          childLayout: {
            orientation: "vertical",
            overflow: "grow",
            positioning: "ordered",
            sectionIds: ["child"],
          },
        },
      },
    };
    const orderedPaste = {
      ...placed,
      destination: {
        parentId: "root",
        placement: { index: 0, type: "ordered" as const },
      },
    };
    const orderedResult = applyWorkspaceDocumentCommand(
      orderedDocument,
      { paste: orderedPaste, type: "paste-sections" },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );
    expect(orderedResult).toMatchObject({ reason: "section-paste", status: "applied" });
    if (orderedResult.status !== "applied") throw new Error("Expected a nested ordered paste.");
    expect(orderedResult.document.sections.root?.childLayout?.sectionIds).toEqual([
      firstId,
      secondId,
      "child",
    ]);
    expect(
      applyWorkspaceDocumentCommand(
        orderedDocument,
        {
          paste: {
            ...orderedPaste,
            destination: {
              parentId: "root",
              placement: { index: 2, type: "ordered" },
            },
          },
          type: "paste-sections",
        },
        WORKSPACE_DEFAULT_CAPABILITIES,
      ),
    ).toMatchObject({ reason: "section-move-invalid", status: "rejected" });
  });

  it("resolves only unmodified platform copy and paste shortcuts", () => {
    const event = {
      altKey: false,
      ctrlKey: true,
      key: "c",
      metaKey: false,
      shiftKey: false,
    };
    expect(resolveWorkspaceClipboardShortcut(event)).toBe("copySelection");
    expect(resolveWorkspaceClipboardShortcut({ ...event, key: "v" })).toBe("paste");
    expect(resolveWorkspaceClipboardShortcut({ ...event, ctrlKey: false, metaKey: true })).toBe(
      "copySelection",
    );
    expect(resolveWorkspaceClipboardShortcut({ ...event, shiftKey: true })).toBeNull();
    expect(resolveWorkspaceClipboardShortcut({ ...event, altKey: true })).toBeNull();
    expect(resolveWorkspaceClipboardShortcut({ ...event, key: "x" })).toBeNull();
  });
});
