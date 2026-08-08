import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
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
  readonly controller: WorkspaceController<TSectionData>;

  constructor(document: WorkspaceDocument<TSectionData>, policy: WorkspaceInMemoryPolicy = {}) {
    validateWorkspaceDocument(document);
    this.#document = document;
    this.#capabilities = resolveWorkspaceCapabilities(policy.capabilities, policy.readOnly);
    this.controller = createWorkspaceController({
      commit: (nextDocument, change) => {
        this.#document = nextDocument;
        this.#changes.push({ change, document: nextDocument });
      },
      getCapabilities: () => this.#capabilities,
      getDocument: () => this.#document,
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
