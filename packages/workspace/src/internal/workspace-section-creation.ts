import type {
  WorkspaceActionRejectionReason,
  WorkspaceCreateSectionOptions,
  WorkspaceDocument,
  WorkspaceJsonValue,
  WorkspaceSection,
} from "../core.js";
import { planWorkspaceSectionPlacement } from "../core.js";
import { optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type {
  WorkspaceSectionFactory,
  WorkspaceSectionFactoryResult,
} from "./workspace-section-contract.js";
import { normalizeWorkspaceSectionTitle } from "./workspace-section-input-validation.js";
import type {
  ResolvedSectionDefinition,
  WorkspaceSectionRegistry,
} from "./workspace-section-registry.js";
import type { WorkspacePlacementRect } from "./workspace-smart-placement.js";

export type WorkspaceSectionDefinitionGroup<TSectionData = WorkspaceJsonValue> = Readonly<{
  definitions: readonly ResolvedSectionDefinition<TSectionData>[];
  label: string;
}>;

export type WorkspaceRootCreationPlan<TSectionData> =
  | Readonly<{
      panTarget: Readonly<{ x: number; y: number }> | null;
      position: Readonly<{ x: number; y: number }>;
      section: WorkspaceSection<TSectionData>;
      status: "ready";
    }>
  | Readonly<{
      reason: Extract<
        WorkspaceActionRejectionReason,
        "canvas-unavailable" | "unknown-section-kind"
      >;
      status: "rejected";
    }>;

const factoryResultKeys = ["data", "id", "title"] as const;
const WORKSPACE_CREATION_CHROME_INSET = 72;

function factoryResultAt<TSectionData>(
  value: WorkspaceSectionFactoryResult<TSectionData>,
): WorkspaceSectionFactoryResult<TSectionData> {
  const result = optionOverridesAt(
    value,
    factoryResultKeys,
    "Workspace section factory result",
    "workspace section factory result field",
  );
  if (!Object.hasOwn(result, "data")) {
    throw new TypeError("Workspace section factory result must provide data.");
  }
  if (typeof result.id !== "string" || result.id.trim().length === 0) {
    throw new TypeError("Workspace section factory result id must be a non-empty string.");
  }
  if (result.title !== undefined && typeof result.title !== "string") {
    throw new TypeError("Workspace section factory result title must be a string when provided.");
  }
  return result as WorkspaceSectionFactoryResult<TSectionData>;
}

export function createWorkspaceSectionFromDefinition<TSectionData>(
  definition: ResolvedSectionDefinition<TSectionData>,
  factory: WorkspaceSectionFactory<TSectionData>,
): WorkspaceSection<TSectionData> {
  return createWorkspaceSectionFromFactoryResult(definition, factory({ kind: definition.kind }));
}

function createWorkspaceSectionFromFactoryResult<TSectionData>(
  definition: ResolvedSectionDefinition<TSectionData>,
  resultValue: WorkspaceSectionFactoryResult<TSectionData>,
): WorkspaceSection<TSectionData> {
  const result = factoryResultAt(resultValue);
  return {
    childLayout: definition.canContainSections
      ? {
          orientation: definition.defaultChildOrientation,
          overflow: definition.defaultChildOverflow,
          positioning: "ordered",
          sectionIds: [],
        }
      : null,
    data: result.data,
    id: result.id,
    isMinimized: false,
    kind: definition.kind,
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: definition.chrome, tagColor: null },
    size: {
      height: {
        mode: definition.defaultSizeMode.height,
        value: definition.defaultSize.height,
      },
      width: {
        mode: definition.defaultSizeMode.width,
        value: definition.defaultSize.width,
      },
    },
    title: normalizeWorkspaceSectionTitle(result.title ?? definition.defaultTitle),
  };
}

function searchableDefinitionText<TSectionData>(
  definition: ResolvedSectionDefinition<TSectionData>,
): string {
  return [
    definition.displayName,
    definition.kind,
    definition.creation.group ?? "",
    ...definition.creation.keywords,
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function filterWorkspaceSectionDefinitions<TSectionData>(
  definitions: readonly ResolvedSectionDefinition<TSectionData>[],
  query: string,
): readonly ResolvedSectionDefinition<TSectionData>[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) {
    return definitions;
  }
  return definitions.filter((definition) => {
    const searchableText = searchableDefinitionText(definition);
    return terms.every((term) => searchableText.includes(term));
  });
}

export function groupWorkspaceSectionDefinitions<TSectionData>(
  definitions: readonly ResolvedSectionDefinition<TSectionData>[],
): readonly WorkspaceSectionDefinitionGroup<TSectionData>[] {
  const grouped = new Map<string, ResolvedSectionDefinition<TSectionData>[]>();
  for (const definition of definitions) {
    const label = definition.creation.group ?? "Other";
    const group = grouped.get(label) ?? [];
    group.push(definition);
    grouped.set(label, group);
  }
  return [...grouped].map(([label, group]) => ({ definitions: group, label }));
}

function workspaceRootPlacementRects<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  measuredRect: (sectionId: string) => WorkspacePlacementRect | undefined,
): readonly WorkspacePlacementRect[] {
  return document.rootSections.map((root) => {
    const measured = measuredRect(root.sectionId);
    if (measured) {
      return measured;
    }
    const section = document.sections[root.sectionId] as WorkspaceSection<TSectionData>;
    return {
      height: section.size.height.value,
      width: section.size.width.value,
      x: root.position.x,
      y: root.position.y,
    };
  });
}

function creationViewport(viewport: WorkspacePlacementRect): WorkspacePlacementRect {
  const inset = Math.min(WORKSPACE_CREATION_CHROME_INSET, Math.max(0, (viewport.width - 1) / 2));
  return {
    ...viewport,
    width: viewport.width - inset * 2,
    x: viewport.x + inset,
  };
}

export function planWorkspaceRootSectionCreation<TSectionData>({
  canvasController,
  document,
  factory,
  gridOptions,
  kind,
  options,
  registry,
}: Readonly<{
  canvasController: WorkspaceCanvasController | null;
  document: WorkspaceDocument<TSectionData>;
  factory: WorkspaceSectionFactory<TSectionData>;
  gridOptions: ResolvedWorkspaceGridOptions;
  kind: string;
  options: WorkspaceCreateSectionOptions;
  registry: WorkspaceSectionRegistry<TSectionData>;
}>): WorkspaceRootCreationPlan<TSectionData> {
  const definition = registry.definition(kind);
  if (!definition) {
    return { reason: "unknown-section-kind", status: "rejected" };
  }
  if (options.position) {
    return {
      panTarget: null,
      position: options.position,
      section: createWorkspaceSectionFromDefinition(definition, factory),
      status: "ready",
    };
  }
  if (!canvasController) {
    return { reason: "canvas-unavailable", status: "rejected" };
  }
  const section = createWorkspaceSectionFromDefinition(definition, factory);
  const rootRects = workspaceRootPlacementRects(document, (sectionId) =>
    canvasController.getSectionRect(sectionId),
  );
  const placement = planWorkspaceSectionPlacement({
    grid: gridOptions.snap ? gridOptions.spacing : null,
    rootRects,
    size: definition.defaultSize,
    viewport: creationViewport(canvasController.getVisibleWorkspaceRect()),
  });
  return {
    panTarget: placement.panTarget,
    position: placement.position,
    section,
    status: "ready",
  };
}
