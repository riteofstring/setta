import type { ListOrientation } from "./collision-characterization.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";

export type AdapterProofSection = {
  id: string;
  title: string;
  width: number;
};

export type AdapterProofNestedSection = AdapterProofSection & {
  children?: readonly AdapterProofNestedSection[];
};

export const ADAPTER_PROOF_SECTIONS: Readonly<Record<string, AdapterProofSection>> = {
  "root-alpha": { id: "root-alpha", title: "Planning section", width: 330 },
  "root-beta": { id: "root-beta", title: "Status section", width: 280 },
  "nested-note-a": { id: "nested-note-a", title: "Research note", width: 240 },
  "nested-container": {
    id: "nested-container",
    title: "Horizontal container",
    width: 288,
  },
  "nested-note-b": { id: "nested-note-b", title: "Decision note", width: 192 },
  "nested-note-c": { id: "nested-note-c", title: "Follow-up note", width: 192 },
  "nested-note-d": { id: "nested-note-d", title: "Scrollable note", width: 240 },
  "nested-status": { id: "nested-status", title: "Status summary", width: 224 },
};

export const INITIAL_ADAPTER_PROOF_HIERARCHY: SectionHierarchySnapshot = {
  rootSectionIds: ["root-alpha", "root-beta"],
  childrenByParent: {
    "root-alpha": ["nested-note-a", "nested-container", "nested-note-d"],
    "root-beta": ["nested-status"],
    "nested-container": ["nested-note-b", "nested-note-c"],
  },
  parentByChild: {
    "root-alpha": null,
    "root-beta": null,
    "nested-note-a": "root-alpha",
    "nested-container": "root-alpha",
    "nested-note-b": "nested-container",
    "nested-note-c": "nested-container",
    "nested-note-d": "root-alpha",
    "nested-status": "root-beta",
  },
  rootPositions: {
    "root-alpha": { x: 40, y: 45 },
    "root-beta": { x: 470, y: 210 },
  },
};

export const ADAPTER_PROOF_ORIENTATIONS: Readonly<Record<string, ListOrientation>> = {
  "nested-container": "horizontal",
};

export function requireAdapterProofSection(sectionId: string): AdapterProofSection {
  const section = ADAPTER_PROOF_SECTIONS[sectionId];
  if (!section) {
    throw new Error(`Missing adapter-proof section metadata for ${sectionId}.`);
  }
  return section;
}

export function adapterProofOrientation(parentId: string | null): ListOrientation {
  return (parentId && ADAPTER_PROOF_ORIENTATIONS[parentId]) || "vertical";
}

export function buildAdapterProofNestedSections(
  hierarchy: SectionHierarchySnapshot,
  parentId: string,
): readonly AdapterProofNestedSection[] {
  return buildChildren(hierarchy, parentId, new Set());
}

function buildChildren(
  hierarchy: SectionHierarchySnapshot,
  parentId: string,
  ancestors: ReadonlySet<string>,
): readonly AdapterProofNestedSection[] {
  if (ancestors.has(parentId)) {
    throw new Error(`Adapter-proof hierarchy contains a cycle at ${parentId}.`);
  }
  const nextAncestors = new Set(ancestors).add(parentId);
  return (hierarchy.childrenByParent[parentId] ?? []).map((sectionId) => {
    const section = requireAdapterProofSection(sectionId);
    const children = buildChildren(hierarchy, sectionId, nextAncestors);
    return children.length === 0 ? section : { ...section, children };
  });
}
