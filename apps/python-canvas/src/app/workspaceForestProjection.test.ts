import type { WorkspaceDocument, WorkspaceSection } from "@riteofstring/setta";
import { describe, expect, it } from "vitest";

import type { ListV2 } from "../api/generatedContract";
import { callableSectionID, listSectionID } from "./workspaceProjectionIds";
import { projectWorkspaceForestProposal } from "./workspaceForestProjection";

const firstWorkspaceId = callableSectionID("callable:first");
const secondWorkspaceId = callableSectionID("callable:second");
const listWorkspaceId = listSectionID("list:objects");

const sectionDescriptors = [
  { canonicalId: "callable:first", workspaceId: firstWorkspaceId },
  { canonicalId: "callable:second", workspaceId: secondWorkspaceId },
  { canonicalId: "list:objects", workspaceId: listWorkspaceId },
];

function createSection(
  id: string,
  children: Array<string> = [],
): WorkspaceSection {
  return {
    children,
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "test",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 80, width: 160 },
    styleColor: null,
    tagColor: null,
  };
}

function createDocument({
  listChildren,
  topLevelSectionIds,
}: {
  listChildren: Array<string>;
  topLevelSectionIds: Array<string>;
}): WorkspaceDocument {
  const topLevelSections: WorkspaceDocument["topLevelSections"] = {};
  for (const [zIndex, sectionId] of topLevelSectionIds.entries()) {
    topLevelSections[sectionId] = { h: 80, w: 160, x: 0, y: 0, zIndex };
  }
  return {
    activeIds: [],
    savedViews: null,
    sections: {
      [firstWorkspaceId]: createSection(firstWorkspaceId),
      [secondWorkspaceId]: createSection(secondWorkspaceId),
      [listWorkspaceId]: createSection(listWorkspaceId, listChildren),
    },
    topLevelSections,
    viewport: null,
  };
}

function projectForest({
  document,
  listChildren,
  snapshotTopLevelSectionIds,
}: {
  document: WorkspaceDocument;
  listChildren: Array<string>;
  snapshotTopLevelSectionIds: Array<string>;
}) {
  const lists: Array<ListV2> = [
    { childSectionIds: listChildren, id: "list:objects", name: "Objects" },
  ];
  return projectWorkspaceForestProposal(
    document,
    lists,
    sectionDescriptors,
    snapshotTopLevelSectionIds,
  );
}

describe("workspace forest projection", () => {
  it("preserves canonical root order when view stacking changes", () => {
    const document = createDocument({
      listChildren: [],
      topLevelSectionIds: [
        listWorkspaceId,
        secondWorkspaceId,
        firstWorkspaceId,
      ],
    });
    const stacked = {
      ...document,
      activeIds: [secondWorkspaceId],
      topLevelSections: {
        ...document.topLevelSections,
        [firstWorkspaceId]: {
          ...document.topLevelSections[firstWorkspaceId]!,
          zIndex: 2,
        },
        [secondWorkspaceId]: {
          ...document.topLevelSections[secondWorkspaceId]!,
          zIndex: 0,
        },
        [listWorkspaceId]: {
          ...document.topLevelSections[listWorkspaceId]!,
          zIndex: 1,
        },
      },
    };

    expect(
      projectForest({
        document: stacked,
        listChildren: [],
        snapshotTopLevelSectionIds: [
          "callable:first",
          "callable:second",
          "list:objects",
        ],
      }),
    ).toEqual({
      listChildren: [{ childSectionIds: [], listId: "list:objects" }],
      topLevelSectionIds: ["callable:first", "callable:second", "list:objects"],
    });
  });

  it("removes roots that became nested and appends newly top-level roots in document order", () => {
    const nested = createDocument({
      listChildren: [firstWorkspaceId],
      topLevelSectionIds: [secondWorkspaceId, listWorkspaceId],
    });

    expect(
      projectForest({
        document: nested,
        listChildren: [],
        snapshotTopLevelSectionIds: [
          "callable:first",
          "list:objects",
          "callable:second",
        ],
      }),
    ).toEqual({
      listChildren: [
        { childSectionIds: ["callable:first"], listId: "list:objects" },
      ],
      topLevelSectionIds: ["list:objects", "callable:second"],
    });

    const raised = createDocument({
      listChildren: [],
      topLevelSectionIds: [
        listWorkspaceId,
        secondWorkspaceId,
        firstWorkspaceId,
      ],
    });

    expect(
      projectForest({
        document: raised,
        listChildren: ["callable:first", "callable:second"],
        snapshotTopLevelSectionIds: ["list:objects"],
      }),
    ).toEqual({
      listChildren: [{ childSectionIds: [], listId: "list:objects" }],
      topLevelSectionIds: ["list:objects", "callable:second", "callable:first"],
    });
  });
});
