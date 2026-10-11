import type { WorkspaceClipboardPasteRequest } from "@riteofstring/setta";
import { describe, expect, it } from "vitest";

import projectSnapshotFixture from "@setta/python-canvas/project-snapshot-v2.json";
import { parseProjectSnapshotV2 } from "../api/runtimeContract";
import {
  GENERATED_PYTHON_SECTION_ID,
  callableSectionID,
  listSectionID,
  parameterDictionarySectionID,
} from "./workspaceProjection";
import {
  canCopyProjectClipboardSelection,
  createClipboardRootLayoutOverrides,
  createClipboardSectionPresentationOverrides,
  createProjectClipboardCopyRequest,
  projectClipboardPastedWorkspaceRootIds,
} from "./workspaceClipboardAdapter";

describe("Python Canvas workspace clipboard adapter", () => {
  it("maps only authored callable, dictionary, and list roots to canonical copy ids", () => {
    const snapshot = clipboardSnapshot();

    expect(
      createProjectClipboardCopyRequest(snapshot, [
        callableSectionID("callable:one"),
        parameterDictionarySectionID("dictionary:one"),
        listSectionID("list:one"),
      ]),
    ).toEqual({
      observedRevision: snapshot.project.revision,
      projectId: snapshot.project.id,
      rootSectionIds: ["callable:one", "dictionary:one", "list:one"],
    });
    expect(() =>
      createProjectClipboardCopyRequest(snapshot, [
        GENERATED_PYTHON_SECTION_ID,
      ]),
    ).toThrow("not authored project content");
    expect(() =>
      createProjectClipboardCopyRequest(snapshot, [
        "python-canvas:pending-callable:one",
      ]),
    ).toThrow("not authored project content");
    expect(
      canCopyProjectClipboardSelection(snapshot, [
        callableSectionID("callable:one"),
      ]),
    ).toBe(true);
    expect(
      canCopyProjectClipboardSelection(snapshot, [GENERATED_PYTHON_SECTION_ID]),
    ).toBe(false);
    expect(
      canCopyProjectClipboardSelection(snapshot, [
        "python-canvas:pending-list:one",
      ]),
    ).toBe(false);
    expect(canCopyProjectClipboardSelection(snapshot, [])).toBe(false);
    expect(
      canCopyProjectClipboardSelection(null, [
        callableSectionID("callable:one"),
      ]),
    ).toBe(false);
  });

  it("preserves copied root positions and dimensions while returning projected root ids", () => {
    const snapshot = clipboardSnapshot();
    const request = clipboardPasteRequest();

    expect(
      createClipboardRootLayoutOverrides(request, [
        "callable:pasted",
        "dictionary:pasted",
      ]),
    ).toEqual(
      new Map([
        ["callable:pasted", { h: 110, w: 300, x: 400, y: 500 }],
        ["dictionary:pasted", { h: 250, w: 420, x: 464, y: 532 }],
      ]),
    );
    expect(
      projectClipboardPastedWorkspaceRootIds(snapshot, [
        "callable:one",
        "dictionary:one",
        "list:one",
      ]),
    ).toEqual([
      callableSectionID("callable:one"),
      parameterDictionarySectionID("dictionary:one"),
      listSectionID("list:one"),
    ]);
    expect(() =>
      createClipboardRootLayoutOverrides(request, ["callable:pasted"]),
    ).toThrow("did not return every copied root");
  });

  it("pairs copied payload subtrees with accepted canonical ids before preserving presentation", () => {
    const request = clipboardPasteRequest();

    expect(
      createClipboardSectionPresentationOverrides(
        request,
        clipboardPayload(),
        pastedClipboardSnapshot(),
        ["callable:pasted", "dictionary:pasted"],
      ),
    ).toEqual(
      new Map([
        [
          "callable:pasted",
          {
            isHorizontalOrientation: true,
            isMinimized: true,
            overflowMode: true,
            positionAndSizeLocked: true,
            size: { height: "auto", width: 320 },
            styleColor: "#ef4444",
            tagColor: "#f97316",
          },
        ],
        [
          "dictionary:pasted",
          {
            isHorizontalOrientation: false,
            isMinimized: false,
            overflowMode: false,
            positionAndSizeLocked: false,
            size: { height: 200, width: 380 },
            styleColor: "#3b82f6",
            tagColor: "#22c55e",
          },
        ],
      ]),
    );
    expect(() =>
      createClipboardSectionPresentationOverrides(
        request,
        clipboardPayload(),
        pastedClipboardSnapshot(),
        ["dictionary:pasted", "callable:pasted"],
      ),
    ).toThrow("section kind");
    const callableId = callableSectionID("callable:one");
    const mismatchedFragmentKindRequest = {
      ...request,
      fragment: {
        ...request.fragment,
        sections: {
          ...request.fragment.sections,
          [callableId]: {
            ...request.fragment.sections[callableId]!,
            kind: "python-canvas.parameter-dictionary",
          },
        },
      },
    };
    expect(() =>
      createClipboardSectionPresentationOverrides(
        mismatchedFragmentKindRequest,
        clipboardPayload(),
        pastedClipboardSnapshot(),
        ["callable:pasted", "dictionary:pasted"],
      ),
    ).toThrow("fragment kind");
  });

  it("pairs each nested copied section with its accepted canonical descendant", () => {
    const listId = listSectionID("list:source");
    const callableId = callableSectionID("callable:source");
    const dictionaryId = parameterDictionarySectionID("dictionary:source");
    const payload = {
      callables: [
        {
          authoredExpression: "value",
          id: "callable:source",
          name: "Source callable",
          parameters: [],
        },
      ],
      lists: [
        {
          childSectionIds: ["callable:source", "dictionary:source"],
          id: "list:source",
          name: "Source list",
        },
      ],
      parameterDictionaries: [
        {
          entries: [],
          id: "dictionary:source",
          name: "Source dictionary",
        },
      ],
      rootSectionIds: ["list:source"],
      version: 1 as const,
    };
    const request: WorkspaceClipboardPasteRequest = {
      fragment: {
        roots: [listId],
        sections: {
          [callableId]: clipboardSection(callableId, "python-canvas.callable", {
            size: { height: 180, width: 320 },
            styleColor: "#3b82f6",
          }),
          [dictionaryId]: clipboardSection(
            dictionaryId,
            "python-canvas.parameter-dictionary",
            {
              size: { height: 280, width: 460 },
              tagColor: "#ec4899",
            },
          ),
          [listId]: {
            ...clipboardSection(listId, "python-canvas.list", {
              isHorizontalOrientation: true,
              isMinimized: true,
              overflowMode: true,
              positionAndSizeLocked: true,
              size: { height: 50, width: 360 },
              styleColor: "#ef4444",
              tagColor: "#f97316",
            }),
            children: [callableId, dictionaryId],
          },
        },
        topLevelLayouts: {
          [listId]: { h: 50, w: 360, x: 0, y: 0, zIndex: 2 },
        },
      },
      payload,
      payloadVersion: 1,
      placement: { x: 400, y: 500 },
      rootIds: [listId],
    };
    const snapshot = parseProjectSnapshotV2({
      ...projectSnapshotFixture,
      callables: [
        {
          authoredExpression: "pasted",
          id: "callable:pasted",
          name: "Pasted callable",
          parameters: [],
        },
      ],
      lists: [
        {
          childSectionIds: ["callable:pasted", "dictionary:pasted"],
          id: "list:pasted",
          name: "Pasted list",
        },
      ],
      parameterDictionaries: [
        {
          entries: [],
          id: "dictionary:pasted",
          name: "Pasted dictionary",
        },
      ],
      topLevelSectionIds: ["list:pasted"],
    });

    expect(
      createClipboardSectionPresentationOverrides(request, payload, snapshot, [
        "list:pasted",
      ]),
    ).toEqual(
      new Map([
        [
          "list:pasted",
          {
            isHorizontalOrientation: true,
            isMinimized: true,
            overflowMode: true,
            positionAndSizeLocked: true,
            size: { height: 50, width: 360 },
            styleColor: "#ef4444",
            tagColor: "#f97316",
          },
        ],
        [
          "callable:pasted",
          {
            isHorizontalOrientation: false,
            isMinimized: false,
            overflowMode: false,
            positionAndSizeLocked: false,
            size: { height: 180, width: 320 },
            styleColor: "#3b82f6",
            tagColor: null,
          },
        ],
        [
          "dictionary:pasted",
          {
            isHorizontalOrientation: false,
            isMinimized: false,
            overflowMode: false,
            positionAndSizeLocked: false,
            size: { height: 280, width: 460 },
            styleColor: null,
            tagColor: "#ec4899",
          },
        ],
      ]),
    );
  });
});

function clipboardSnapshot() {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "value",
        id: "callable:one",
        name: "One",
        parameters: [],
      },
    ],
    lists: [
      {
        childSectionIds: [],
        id: "list:one",
        name: "One list",
      },
    ],
    parameterDictionaries: [
      {
        entries: [],
        id: "dictionary:one",
        name: "One dictionary",
      },
    ],
    topLevelSectionIds: ["callable:one", "dictionary:one", "list:one"],
  });
}

function clipboardPasteRequest(): WorkspaceClipboardPasteRequest {
  const callableId = callableSectionID("callable:one");
  const dictionaryId = parameterDictionarySectionID("dictionary:one");
  return {
    fragment: {
      roots: [callableId, dictionaryId],
      sections: {
        [callableId]: clipboardSection(callableId, "python-canvas.callable", {
          isHorizontalOrientation: true,
          isMinimized: true,
          overflowMode: true,
          positionAndSizeLocked: true,
          size: { height: "auto", width: 320 },
          styleColor: "#ef4444",
          tagColor: "#f97316",
        }),
        [dictionaryId]: clipboardSection(
          dictionaryId,
          "python-canvas.parameter-dictionary",
          {
            size: { height: 200, width: 380 },
            styleColor: "#3b82f6",
            tagColor: "#22c55e",
          },
        ),
      },
      topLevelLayouts: {
        [callableId]: { h: 110, w: 300, x: 0, y: 0, zIndex: 2 },
        [dictionaryId]: { h: 250, w: 420, x: 64, y: 32, zIndex: 3 },
      },
    },
    payload: clipboardPayload(),
    payloadVersion: 1,
    placement: { x: 400, y: 500 },
    rootIds: [callableId, dictionaryId],
  };
}

function clipboardSection(
  id: string,
  kind: string,
  overrides: Partial<{
    isHorizontalOrientation: boolean;
    isMinimized: boolean;
    overflowMode: boolean;
    positionAndSizeLocked: boolean;
    size: { height: number | "auto"; width: number | "auto" };
    styleColor: string | null;
    tagColor: string | null;
  }> = {},
) {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind,
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 200 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

function clipboardPayload() {
  return {
    callables: [
      {
        authoredExpression: "value",
        id: "callable:one",
        name: "One",
        parameters: [],
      },
    ],
    lists: [],
    parameterDictionaries: [
      {
        entries: [],
        id: "dictionary:one",
        name: "One dictionary",
      },
    ],
    rootSectionIds: ["callable:one", "dictionary:one"],
    version: 1 as const,
  };
}

function pastedClipboardSnapshot() {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression: "value",
        id: "callable:pasted",
        name: "Pasted",
        parameters: [],
      },
    ],
    parameterDictionaries: [
      {
        entries: [],
        id: "dictionary:pasted",
        name: "Pasted dictionary",
      },
    ],
    topLevelSectionIds: ["callable:pasted", "dictionary:pasted"],
  });
}
