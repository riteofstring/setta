import type { WorkspaceDocument } from "@setta/workspace";
import { createWorkspaceHost } from "@setta/workspace";
import { describe, expect, it } from "vitest";

import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v2.json";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";
import { registerPythonCanvasSectionKinds } from "./pythonCanvasSectionKinds";
import {
  dictionaryEntryWorkspaceItemID,
  parameterDictionarySectionID,
  projectWorkspaceDocument,
  readParameterDictionaryEntries,
} from "./workspaceProjection";
import { createDictionaryEntryParentPromotionScheduler } from "./dictionaryEntryParentPromotion";

const CODE_UI = {
  type: "CodeParam",
  configuration: {
    disabled: false,
    language: "python",
    placeholder: null,
    singleLine: true,
    wrapLines: true,
  },
} as const;
const NESTED_UI = { type: "NestedParam", configuration: {} } as const;

describe("dictionary entry parent promotion", () => {
  it("defers a leaf-to-parent promotion beyond the workspace notification", async () => {
    const radius = {
      authoredExpression: "missing_radius",
      id: "entry:radius",
      kind: "leaf" as const,
      name: "radius",
      ui: CODE_UI,
    };
    const scale = {
      authoredExpression: "2",
      id: "entry:scale",
      kind: "leaf" as const,
      name: "scale",
      ui: CODE_UI,
    };
    const snapshot = parseProjectSnapshotV2({
      ...projectSnapshotFixture,
      parameterDictionaries: [
        {
          entries: [radius, scale],
          id: "dictionary:options",
          name: "Options",
        },
      ],
      project: { ...projectSnapshotFixture.project, revision: 1 },
      topLevelSectionIds: ["dictionary:options"],
    });
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));
    const promotion = createDictionaryEntryParentPromotionScheduler({
      currentSnapshot: () => snapshot,
      host,
      isActive: () => true,
    });
    const unsubscribe = host.subscribe((document) => {
      if (promotion.required(document, snapshot)) {
        promotion.schedule();
      }
    });

    try {
      expect(() =>
        host.loadDocument(nestScaleUnderRadius(host.getSnapshot())),
      ).not.toThrow();
      expect(
        host.getSnapshot().sections[
          parameterDictionarySectionID("dictionary:options")
        ]?.itemTree?.items[dictionaryEntryWorkspaceItemID("entry:radius")]
          ?.presentation?.control,
      ).toMatchObject({ kind: "code" });

      await new Promise<void>((resolve) => queueMicrotask(resolve));

      expect(
        host.getSnapshot().sections[
          parameterDictionarySectionID("dictionary:options")
        ]?.itemTree?.items[dictionaryEntryWorkspaceItemID("entry:radius")]
          ?.presentation?.control,
      ).toMatchObject({ kind: "group" });
      expect(
        readParameterDictionaryEntries(
          host.getSnapshot(),
          "dictionary:options",
        ),
      ).toEqual([
        {
          children: [scale],
          id: radius.id,
          kind: "parent",
          name: radius.name,
          ui: NESTED_UI,
        },
      ]);
    } finally {
      unsubscribe();
      host.dispose();
    }
  });
});

function nestScaleUnderRadius(document: WorkspaceDocument): WorkspaceDocument {
  const sectionId = parameterDictionarySectionID("dictionary:options");
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  const root = itemTree?.items[itemTree.rootId];
  const radiusId = dictionaryEntryWorkspaceItemID("entry:radius");
  const scaleId = dictionaryEntryWorkspaceItemID("entry:scale");
  const radius = itemTree?.items[radiusId];
  if (
    section === undefined ||
    itemTree === undefined ||
    root === undefined ||
    radius === undefined
  ) {
    throw new Error("Expected the projected dictionary entries.");
  }
  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...itemTree,
          items: {
            ...itemTree.items,
            [root.id]: { ...root, children: [radiusId] },
            [radiusId]: { ...radius, children: [scaleId] },
          },
        },
      },
    },
  };
}
