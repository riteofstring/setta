import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  getWorkspaceSectionOrder,
  resolveWorkspaceCapabilities,
  validateWorkspaceDocument,
  type WorkspaceCapabilities,
  type WorkspaceCapabilityOverrides,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceSection,
} from "./core.js";
import { createWorkspaceController } from "./internal/workspace-controller.js";
import { WorkspaceDocumentHistory } from "./internal/workspace-history.js";

export * from "./internal/adapter-proof-drag-planning.js";
export * from "./internal/adapter-proof-model.js";
export * from "./internal/collision-characterization.js";
export * from "./internal/geometry-index.js";
export * from "./internal/interaction-geometry.js";
export * from "./internal/interaction-owner.js";
export * from "./internal/section-move-planning.js";
export * from "./internal/selection-planning.js";
export * from "./internal/sorting-preview.js";
export * from "./internal/transient-root-projection.js";
export * from "./internal/upstream-adapter-proof.js";
export * from "./internal/upstream-dnd-adapter.js";

export type WorkspaceTestSection = Readonly<Pick<WorkspaceSection, "id" | "title">>;

export type WorkspaceInMemoryChange<TSectionData> = Readonly<{
  change: WorkspaceDocumentChange;
  document: WorkspaceDocument<TSectionData>;
}>;

export type WorkspaceInMemoryPolicy = Readonly<{
  capabilities?: WorkspaceCapabilityOverrides;
  readOnly?: boolean;
}>;

export class WorkspaceInMemoryHost<TSectionData> {
  #capabilities: WorkspaceCapabilities;
  readonly #changes: WorkspaceInMemoryChange<TSectionData>[] = [];
  #document: WorkspaceDocument<TSectionData>;
  readonly #history: WorkspaceDocumentHistory<TSectionData>;
  #selection: readonly string[] = [];
  readonly controller: WorkspaceController<TSectionData>;

  constructor(document: WorkspaceDocument<TSectionData>, policy: WorkspaceInMemoryPolicy = {}) {
    validateWorkspaceDocument(document);
    this.#document = document;
    this.#history = new WorkspaceDocumentHistory(document);
    this.#capabilities = resolveWorkspaceCapabilities(policy.capabilities, policy.readOnly);
    const commit = (
      nextDocument: WorkspaceDocument<TSectionData>,
      change: WorkspaceDocumentChange,
    ) => {
      this.#history.stageCommit(this.#document, nextDocument, change, this.#selection);
      this.#document = nextDocument;
      const existingIds = new Set(getWorkspaceSectionOrder(nextDocument));
      this.#selection = this.#selection.filter((sectionId) => existingIds.has(sectionId));
      const synchronization = this.#history.synchronize(nextDocument, this.#selection, false);
      if (synchronization.selection) {
        this.#selection = synchronization.selection;
      }
      this.#changes.push({ change, document: nextDocument });
    };
    const navigateHistory = (direction: "redo" | "undo") => {
      const plan = this.#history.navigate(direction, this.#document, this.#capabilities);
      if (plan.status === "applied") {
        commit(plan.document, plan.change);
        return { status: "applied" } as const;
      }
      return plan;
    };
    this.controller = createWorkspaceController({
      commit,
      getCapabilities: () => this.#capabilities,
      getDocument: () => this.#document,
      getHistoryState: () => this.#history.state(this.#capabilities),
      getSelection: () => this.#selection,
      redo: () => navigateHistory("redo"),
      setSelection: (sectionIds) => {
        const next = [...new Set(sectionIds)];
        const unchanged =
          next.length === this.#selection.length &&
          next.every((sectionId, index) => sectionId === this.#selection[index]);
        if (unchanged) {
          return { status: "unchanged" };
        }
        this.#selection = next;
        return { status: "applied" };
      },
      undo: () => navigateHistory("undo"),
    });
  }

  changes(): readonly WorkspaceInMemoryChange<TSectionData>[] {
    return [...this.#changes];
  }

  document(): WorkspaceDocument<TSectionData> {
    return this.#document;
  }

  setPolicy(policy: WorkspaceInMemoryPolicy): void {
    this.#capabilities = resolveWorkspaceCapabilities(policy.capabilities, policy.readOnly);
  }
}

function testSection({ id, title }: WorkspaceTestSection): WorkspaceSection {
  return {
    childLayout: null,
    data: null,
    id,
    isMinimized: false,
    kind: "test",
    positionAndSizeLocked: false,
    presentation: {
      accentColor: null,
      chrome: "default",
      tagColor: null,
    },
    size: {
      height: { mode: "fixed", value: 180 },
      width: { mode: "fixed", value: 240 },
    },
    title,
  };
}

export function createWorkspaceTestDocument(
  sections: readonly WorkspaceTestSection[],
): WorkspaceDocument {
  return {
    rootSections: sections.map((candidate, index) => ({
      position: { x: index * 280, y: 0 },
      sectionId: candidate.id,
    })),
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: Object.fromEntries(
      sections.map((candidate) => [candidate.id, testSection(candidate)]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
