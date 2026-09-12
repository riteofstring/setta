import {
  createWorkspaceWindowingState,
  type WorkspaceWindowingState,
} from "@setta/workspace";

import type { BenchViewId } from "./projectProjection";

type BenchWindowingStates = Record<BenchViewId, WorkspaceWindowingState>;

export function createBenchWindowingStates(): BenchWindowingStates {
  return {
    build: createWorkspaceWindowingState(),
    compare: createWorkspaceWindowingState({
      windows: [
        {
          bounds: { height: 650, width: 360, x: 270, y: 36 },
          contentId: "bench-comparison-left",
          id: "bench-comparison-left-window",
          rendererData: { side: "left" },
          surfaceKind: "bench-comparison",
          title: "Left result",
        },
        {
          bounds: { height: 650, width: 360, x: 650, y: 36 },
          contentId: "bench-comparison-right",
          id: "bench-comparison-right-window",
          rendererData: { side: "right" },
          surfaceKind: "bench-comparison",
          title: "Right result",
        },
      ],
    }),
    runs: createWorkspaceWindowingState({
      windows: [
        {
          bounds: { height: 620, width: 740, x: 270, y: 42 },
          contentId: "bench-run-history",
          id: "bench-run-history-window",
          rendererData: {},
          surfaceKind: "bench-runs",
          title: "Run history",
        },
      ],
    }),
  };
}
