import { useEffect, useState } from "react";
import {
  WORKSPACE_CODE_SECTION_KIND,
  WorkspaceCanvas,
  WorkspaceProvider,
  createWorkspaceCodeSection,
  createWorkspaceHost,
  registerSectionKinds,
  type WorkspaceHost,
} from "@setta/workspace";

import { fetchProjectSnapshot } from "../backend/client";
import { CallableSection, readCallableSectionData } from "../sections/CallableSection";
import {
  CALLABLE_SECTION_KIND,
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_SIZE,
  projectWorkspaceDocument,
} from "./workspaceProjection";

type AppState =
  | { kind: "loading" }
  | { kind: "ready"; host: WorkspaceHost }
  | { kind: "error" };

export function registerPythonCanvasSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, {
    [CALLABLE_SECTION_KIND]: {
      defaultSize: CALLABLE_SECTION_SIZE,
      contentClassName: "python-canvas-callable-section-content",
      assertValidData: (section) => {
        readCallableSectionData(section.data);
      },
      renderContent: (section) => (
        <CallableSection data={readCallableSectionData(section.data)} />
      ),
    },
    [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
      defaultSize: GENERATED_PYTHON_SECTION_SIZE,
      languages: ["python"],
    }),
  });
}

export function PythonCanvasApp() {
  const [state, setState] = useState<AppState>({ kind: "loading" });

  useEffect(() => {
    const host = createWorkspaceHost();
    registerPythonCanvasSectionKinds(host);

    let active = true;
    let disposed = false;
    const disposeHost = () => {
      if (!disposed) {
        disposed = true;
        host.dispose();
      }
    };

    const load = async () => {
      try {
        const snapshot = await fetchProjectSnapshot();
        if (!active) {
          return;
        }
        host.loadDocument(projectWorkspaceDocument(snapshot));
        setState({ kind: "ready", host });
      } catch {
        if (!active) {
          return;
        }
        disposeHost();
        setState({ kind: "error" });
      }
    };

    void load();

    return () => {
      active = false;
      disposeHost();
    };
  }, []);

  const statusMessage =
    state.kind === "loading"
      ? "Loading project."
      : state.kind === "ready"
        ? "Project loaded."
        : "Project could not be loaded.";

  return (
    <main className="python-canvas-app">
      <div className="python-canvas-heading">
        <h1>Python Canvas</h1>
        <p className="python-canvas-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </div>
      {state.kind === "error" ? (
        <p className="python-canvas-error" role="alert">
          Unable to load the project. Check that the Python Canvas backend is
          running and reload the page.
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <div className="python-canvas-workspace">
          <WorkspaceProvider host={state.host}>
            <WorkspaceCanvas />
          </WorkspaceProvider>
        </div>
      ) : null}
    </main>
  );
}
