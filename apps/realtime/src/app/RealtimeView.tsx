import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  WorkspaceProvider,
  WorkspaceShell,
  createWorkspaceShellViewState,
  useWorkspaceDocumentSnapshot,
  type SectionKindDefinition,
  type WorkspaceDocument,
  type WorkspaceHost,
  type WorkspaceSection,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellViewState,
} from "@setta/workspace";

import type {
  Project,
  RuntimeDeclaration,
  SizeValue,
} from "../backend/generatedContract";
import type { RealtimeSectionKindCatalog } from "./realtimeSectionKinds";
import { RealtimeContext, type RealtimeActions } from "./runtimeContext";
import type { RuntimeViewState } from "./runtimeState";

const EMPTY_TABS: ReadonlyArray<WorkspaceShellTabDefinition> = [];

type RealtimeViewProps = {
  actions: RealtimeActions;
  catalog: RealtimeSectionKindCatalog;
  error: string | null;
  host: WorkspaceHost | null;
  project: Project | null;
  runtime: RuntimeViewState;
};

function initialMode(): "author" | "use" {
  if (typeof window === "undefined") {
    return "use";
  }
  return new URLSearchParams(window.location.search).get("mode") === "author"
    ? "author"
    : "use";
}

function runtimeTitle(runtime: RuntimeDeclaration): string {
  return `${runtime.kind}: ${runtime.entrypoint}`;
}

export function RealtimeView(props: RealtimeViewProps) {
  const [mode, setMode] = useState<"author" | "use">(initialMode);
  const ready = props.host !== null && props.project !== null;
  return (
    <main className={`realtime-app realtime-mode-${mode}`}>
      <p aria-live="polite" className="realtime-announcer" role="status">
        {ready
          ? "Realtime ready."
          : props.error === null
            ? "Loading Realtime."
            : ""}
      </p>
      <p className="realtime-announcer" role="alert">
        {props.error}
      </p>
      {ready ? (
        <RealtimeContext.Provider
          value={{
            actions: props.actions,
            project: props.project!,
            runtime: props.runtime,
          }}
        >
          <WorkspaceProvider host={props.host!}>
            <header className="realtime-app-header">
              <div>
                <span
                  className="realtime-app-eyebrow"
                  title={runtimeTitle(props.project!.runtime)}
                >
                  Setta Realtime
                </span>
                <h1>{props.project!.name}</h1>
              </div>
              <div className="realtime-app-controls">
                <span
                  className={`realtime-connection realtime-connection-${props.runtime.connection}`}
                >
                  {props.runtime.connection}
                </span>
                <div
                  aria-label="Presentation mode"
                  className="realtime-mode-toggle"
                  role="group"
                >
                  <button
                    aria-pressed={mode === "use"}
                    onClick={() => setMode("use")}
                    type="button"
                  >
                    Use
                  </button>
                  <button
                    aria-pressed={mode === "author"}
                    onClick={() => setMode("author")}
                    type="button"
                  >
                    Author
                  </button>
                </div>
              </div>
            </header>
            <div className="realtime-workspace">
              {mode === "author" ? (
                <AuthorWorkspace />
              ) : (
                <UseWorkspace catalog={props.catalog} />
              )}
            </div>
          </WorkspaceProvider>
        </RealtimeContext.Provider>
      ) : (
        <div className="realtime-loading" aria-hidden="true" />
      )}
    </main>
  );
}

function AuthorWorkspace() {
  const [viewState, setViewState] = useState<WorkspaceShellViewState>(() =>
    createWorkspaceShellViewState(),
  );
  const handleViewStateChange = useCallback(
    (next: WorkspaceShellViewState) => setViewState(next),
    [],
  );
  return (
    <WorkspaceShell
      ariaLabel="Realtime authoring workspace"
      includeBuiltInInspector={true}
      includeBuiltInSavedViews={false}
      leadingPaneShiftsCanvas={true}
      leadingTabs={EMPTY_TABS}
      onViewStateChange={handleViewStateChange}
      trailingTabs={EMPTY_TABS}
      viewState={viewState}
    />
  );
}

function numericSize(value: SizeValue, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function renderSectionBody(
  section: WorkspaceSection,
  definition: SectionKindDefinition,
): ReactNode {
  return definition.renderContent(section);
}

function UseSection({
  catalog,
  document,
  section,
}: {
  catalog: RealtimeSectionKindCatalog;
  document: WorkspaceDocument;
  section: WorkspaceSection;
}) {
  const definition = catalog[section.kind as keyof RealtimeSectionKindCatalog];
  if (definition === undefined) {
    return null;
  }
  return (
    <section className={`realtime-use-section realtime-use-${section.kind}`}>
      <h2>{section.name}</h2>
      <div className="realtime-use-section-content">
        {renderSectionBody(section, definition)}
      </div>
      {section.children.length === 0 ? null : (
        <div className="realtime-use-nested">
          {section.children.map((childId) => {
            const child = document.sections[childId];
            return child === undefined ? null : (
              <UseSection
                catalog={catalog}
                document={document}
                key={childId}
                section={child}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function UseWorkspace({ catalog }: { catalog: RealtimeSectionKindCatalog }) {
  const document = useWorkspaceDocumentSnapshot();
  const entries = Object.entries(document.topLevelSections).sort(
    ([, left], [, right]) => left.zIndex - right.zIndex,
  );
  const bounds = entries.reduce(
    (current, [sectionId, layout]) => {
      const section = document.sections[sectionId];
      if (section === undefined) {
        return current;
      }
      const width = layout.w ?? numericSize(section.size.width, 320);
      const height = layout.h ?? numericSize(section.size.height, 180);
      return {
        height: Math.max(current.height, layout.y + height + 48),
        width: Math.max(current.width, layout.x + width + 48),
      };
    },
    { height: 480, width: 720 },
  );
  const viewport = document.viewport;
  const planeStyle: CSSProperties = {
    height: bounds.height,
    transform:
      viewport === null
        ? undefined
        : `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    transformOrigin: "0 0",
    width: bounds.width,
  };
  return (
    <div className="realtime-use-viewport">
      <div className="realtime-use-plane" style={planeStyle}>
        {entries.map(([sectionId, layout]) => {
          const section = document.sections[sectionId];
          if (section === undefined) {
            return null;
          }
          const style: CSSProperties = {
            height: layout.h ?? numericSize(section.size.height, 180),
            left: layout.x,
            position: "absolute",
            top: layout.y,
            width: layout.w ?? numericSize(section.size.width, 320),
            zIndex: layout.zIndex,
          };
          return (
            <div key={sectionId} style={style}>
              <UseSection
                catalog={catalog}
                document={document}
                section={section}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
