import { NodeIdContext } from "gpuFlow/NodeIdContext";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  const initialState = store.getInitialState();
  Object.assign(initialState, store.getState());
}

function seedAgenticEdges(): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      agenticEdges: [],
    });
  });
  syncStoreInitialState(useProjectState);
}

function renderHandles({
  scenePortGeometry = false,
  sectionId,
}: {
  readonly scenePortGeometry?: boolean;
  readonly sectionId: string;
}): string {
  return renderToStaticMarkup(
    <NodeIdContext.Provider value={sectionId}>
      <AgenticEdgeHandles
        isUserView={false}
        scenePortGeometry={scenePortGeometry}
      />
    </NodeIdContext.Provider>,
  );
}

describe("AgenticEdgeHandles", () => {
  beforeEach(() => {
    resetProjectStores();
    seedAgenticEdges();
    gpuFlowViewportStore.getState().cancelConnection();
  });

  afterEach(() => {
    resetProjectStores();
    gpuFlowViewportStore.getState().cancelConnection();
  });

  it("leaves scene-owned agentic handles out of DOM gesture-start ownership", () => {
    const standaloneMarkup = renderHandles({ sectionId: "section-agentic" });
    const sceneMarkup = renderHandles({
      scenePortGeometry: true,
      sectionId: "section-agentic",
    });

    expect(standaloneMarkup).toContain("connectablestart");
    expect(sceneMarkup).not.toContain("connectablestart");
    expect(sceneMarkup).toContain("connectableend");
  });
});
