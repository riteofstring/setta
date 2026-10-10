import type { WorkspaceDocumentInput } from "@setta/workspace";

type Layout = WorkspaceDocumentInput["topLevelSections"][string];
type View = [string, string, Record<string, Layout>];
const brief = "python-canvas:playground:brief";

const groups = {
  data: [
    "paths",
    "dataset-train",
    "dataset-validation",
    "dataset-test",
    "dataset-smoke",
    "augmentations",
    "preprocessing",
    "pipeline-train",
    "pipeline-eval",
    "loader-train",
    "loader-validation",
    "loader-test",
    "loader-smoke",
    "cache",
  ],
  model: [
    "defaults",
    "embedding",
    "attention",
    "feed-forward",
    "encoder",
    "head",
    "model",
  ],
  train: [
    "resources",
    "distributed",
    "local-distributed",
    "gradients",
    "precision",
    "budget",
    "smoke-budget",
    "parameter-groups",
    "optimizer",
    "sgd",
    "stages",
    "schedule",
    "smoke-stages",
    "smoke-schedule",
    "losses",
    "loop",
    "smoke-loop",
    "sgd-loop",
  ],
  evaluate: [
    "storage",
    "tracker",
    "callbacks",
    "metrics",
    "evaluation",
    "baseline",
    "smoke",
    "sgd-run",
    "runs",
  ],
};

export function trainingSystemViews(document: WorkspaceDocumentInput): View[] {
  const ids = Object.keys(document.topLevelSections);
  const find = (id: string) =>
    ids.find((candidate) => candidate.endsWith(`:${id}`));
  const arrange = (names: string[], columns: number) => {
    const heights = Array<number>(columns).fill(0);
    const placements: Record<string, Layout> = {};
    for (const name of names) {
      const id = find(name);
      const section = id ? document.sections[id] : undefined;
      if (!id || !section) continue;
      const column = heights.indexOf(Math.min(...heights));
      const height = sectionHeight(document, id);
      placements[id] = {
        x: column * 540,
        y: heights[column] ?? 0,
        w: 500,
        h: section.children.length ? null : height,
        zIndex: 0,
      };
      heights[column] = (heights[column] ?? 0) + height + 40;
    }
    return placements;
  };
  const overview = arrange(["defaults", "baseline", "runs"], 2);
  overview[brief] = { x: 0, y: 465, w: 500, h: 445, zIndex: 0 };
  const runsId = find("runs");
  if (runsId) overview[runsId] = { x: 540, y: 465, w: 500, h: 225, zIndex: 0 };
  const system = arrange([...new Set(Object.values(groups).flat())], 6);
  const generated = "python-canvas:generated-python";
  return [
    ["explore", "Start", overview],
    ...Object.entries(groups).map(([id, names]): View => [
      id,
      id[0]!.toUpperCase() + id.slice(1),
      arrange(names, 3),
    ]),
    ["system", "System", system],
    [
      "python",
      "Python",
      { [generated]: { x: 0, y: 0, w: 1100, h: 700, zIndex: 0 } },
    ],
  ];
}

function sectionHeight(document: WorkspaceDocumentInput, id: string): number {
  const section = document.sections[id];
  if (!section) return 160;
  if (section.children.length)
    return (
      90 +
      section.children.reduce(
        (total, child) => total + sectionHeight(document, child) + 16,
        0,
      )
    );
  const count =
    section.itemTree?.items[section.itemTree.rootId]?.children.length ?? 0;
  return Math.max(160, 105 + count * 40);
}
