import {
  createWorkspaceSavedViewsState,
  createWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_KIND,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
} from "@setta/workspace";
import { getPlayground, type Playground } from "./playgroundCatalog";

const briefId = "python-canvas:playground:brief";
const generatedId = "python-canvas:generated-python";
const outputId = (id: string) => `python-canvas:display:${id}`;
type Layout = WorkspaceDocument["topLevelSections"][string];

function layout(
  x: number,
  y: number,
  w: number,
  h: number | null,
  zIndex = 0,
): Layout {
  return { x, y, w, h, zIndex };
}

export function addPlaygroundSections(
  document: WorkspaceDocument,
  projectId: string,
  previous?: WorkspaceDocument,
): WorkspaceDocument {
  const playground = getPlayground(projectId);
  if (!playground) return document;
  const sections = { ...document.sections };
  const topLevelSections = { ...document.topLevelSections };
  const definitions = [
    {
      id: briefId,
      kind: WORKSPACE_TEXT_SECTION_KIND,
      name: "The challenge",
      data: createWorkspaceTextSectionData({
        text: playground.brief,
        format: "markdown",
        displayMode: "render",
        readOnly: true,
      }),
    },
    ...playground.panels.map((panel) => ({
      id: outputId(panel.id),
      kind: `python-canvas.display.${panel.kind}`,
      name: panel.name,
      data: {},
    })),
  ];
  for (const [index, definition] of definitions.entries()) {
    sections[definition.id] = previous?.sections[definition.id] ?? {
      ...definition,
      size: { width: 640, height: 430 },
      overflowMode: false,
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      tagColor: null,
      children: [],
    };
    topLevelSections[definition.id] =
      previous?.topLevelSections[definition.id] ??
      layout(index * 672, 0, 640, 430, index + 20);
  }
  return { ...document, sections, topLevelSections };
}

export function playgroundLayout(
  document: WorkspaceDocumentInput,
  projectId: string,
): WorkspaceDocumentInput {
  const playground = getPlayground(projectId);
  if (!playground) return document;
  const definitions = playgroundViews(playground, projectId);
  const placements = Object.assign(
    {},
    document.topLevelSections,
    ...definitions.map(([, , shown]) => shown),
  );
  const arranged = {
    ...document,
    sections: sizeSections(document.sections, placements),
    topLevelSections: placements,
  };
  const views = Object.fromEntries(
    definitions.map(([id, name, shown], index) => {
      const view = createWorkspaceSavedViewsState(arranged, {
        id,
        name,
        isTab: true,
      }).views[id]!;
      return [
        id,
        {
          ...view,
          sortIndex: index,
          topLevelSections: { ...view.topLevelSections, ...shown },
          sectionVisibility: Object.fromEntries(
            Object.keys(placements).map((sectionId) => [
              sectionId,
              Object.hasOwn(shown, sectionId),
            ]),
          ),
        },
      ];
    }),
  );
  return { ...arranged, savedViews: { activeViewId: "explore", views } };
}

function playgroundViews(
  playground: Playground,
  projectId: string,
): Array<[string, string, Record<string, Layout>]> {
  const [image, second, table, report] = playground.panels.map((panel) =>
    outputId(panel.id),
  );
  if (!image || !second || !table || !report) return [];
  const explore = {
    [playground.control]: layout(0, 0, 340, 230),
    [briefId]: layout(0, 264, 340, 356),
    [image]: layout(374, 0, 800, 620),
  };
  const compare =
    projectId === "art-studio"
      ? {
          [second]: layout(0, 0, 790, 660),
          [table]: layout(824, 0, 390, 330),
          [report]: layout(824, 365, 390, 295),
        }
      : {
          [second]: layout(0, 0, 590, 410),
          [table]: layout(626, 0, 640, 410),
          [report]: layout(0, 446, 1266, 320),
        };
  const build = buildLayouts(playground);
  const source = { [generatedId]: layout(0, 0, 1100, 700) };
  return [
    ["explore", "Explore", explore],
    ["compare", projectId === "art-studio" ? "Gallery" : "Compare", compare],
    ["build", "Build", build],
    ["python", "Python", source],
  ];
}

function buildLayouts(playground: Playground): Record<string, Layout> {
  const lists = playground.objects.filter((id) =>
    id.startsWith("python-canvas:list:"),
  );
  const callables = playground.objects.filter((id) => !lists.includes(id));
  const placements: Record<string, Layout> = Object.fromEntries(
    lists.map((id, index) => [id, layout(index * 440, 0, 400, null)]),
  );
  const beside = lists.length === 1;
  for (const [index, id] of callables.entries()) {
    placements[id] = layout(
      beside ? 460 : 0,
      (beside ? 0 : 440) + index * 340,
      beside ? 500 : 400,
      300,
    );
  }
  if (beside)
    placements[playground.control] = layout(
      460,
      callables.length * 340,
      340,
      230,
    );
  return placements;
}

function sizeSections(
  input: WorkspaceDocumentInput["sections"],
  placements: Record<string, Layout>,
) {
  const sections = { ...input };
  for (const [id, placement] of Object.entries(placements)) {
    const section = sections[id];
    if (section)
      sections[id] = {
        ...section,
        size: { width: placement.w ?? 400, height: placement.h ?? "auto" },
      };
  }
  sizeObjectLists(sections);
  return sections;
}

function sizeObjectLists(sections: WorkspaceDocumentInput["sections"]) {
  for (const section of Object.values(sections)) {
    if (!section.kind.includes("list")) continue;
    for (const childId of section.children) {
      const child = sections[childId];
      if (!child) continue;
      const count =
        child.itemTree?.items[child.itemTree.rootId]?.children.length ?? 0;
      sections[childId] = {
        ...child,
        size: { width: 400, height: 110 + count * 28 },
      };
    }
  }
}
