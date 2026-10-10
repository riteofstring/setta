import {
  createWorkspaceSavedViewsState,
  type WorkspaceDocumentInput,
} from "@setta/workspace";

export function modelWorkshopLayout(
  document: WorkspaceDocumentInput,
): WorkspaceDocumentInput {
  const data = "python-canvas:callable:data";
  const steps = "python-canvas:list:steps";
  const pipeline = "python-canvas:callable:pipeline";
  const generated = "python-canvas:generated-python";
  const placements = {
    [data]: { x: 0, y: 0, w: 400, h: 260, zIndex: 0 },
    [steps]: { x: 0, y: 0, w: 400, h: null, zIndex: 1 },
    [pipeline]: { x: 0, y: 308, w: 400, h: 180, zIndex: 2 },
    [generated]: { x: 448, y: 0, w: 720, h: 260, zIndex: 3 },
  };
  const sections = { ...document.sections };
  const topLevelSections = { ...document.topLevelSections };
  for (const [id, placement] of Object.entries(placements)) {
    const section = sections[id];
    if (!section || !topLevelSections[id]) continue;
    sections[id] = {
      ...section,
      size: { width: placement.w, height: placement.h ?? "auto" },
    };
    topLevelSections[id] = placement;
  }
  for (const [id, height] of [
    ["python-canvas:callable:scale", 120],
    ["python-canvas:callable:features", 200],
    ["python-canvas:callable:classifier", 200],
  ] as const) {
    const section = sections[id];
    if (section) sections[id] = { ...section, size: { width: 400, height } };
  }
  const arranged = { ...document, sections, topLevelSections };
  const build = createWorkspaceSavedViewsState(arranged, {
    id: "build",
    name: "Build & run",
    isTab: true,
  }).views.build!;
  const explore = createWorkspaceSavedViewsState(arranged, {
    id: "data",
    name: "Data & wiring",
    isTab: true,
  }).views.data!;
  return {
    ...arranged,
    savedViews: {
      activeViewId: "build",
      views: {
        build: {
          ...build,
          sectionVisibility: {
            ...build.sectionVisibility,
            [data]: false,
            [pipeline]: false,
          },
        },
        data: {
          ...explore,
          sortIndex: 1,
          sectionVisibility: { ...explore.sectionVisibility, [steps]: false },
        },
      },
    },
  };
}
