import {
  getCurrEffectiveSectionImpl,
  getSectionChildren,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import type { SectionType } from "utils/generatedTypes";
import { SectionTypeEnum } from "utils/generatedTypes";
import { sanitizeNameForSlug } from "./nameValidation";

type SectionSlugProjectState = Pick<
  ZustandProjectState,
  | "sections"
  | "parentSectionMap"
  | "sectionImpls"
  | "sectionVariants"
  | "projectConfig"
>;

type SectionSlugIndex = {
  slugToIds: Record<string, Array<string>>;
  childrenByParent: Record<string, Array<string>>;
};

type StandaloneSectionSlugResolution =
  | {
      kind: "found";
      sectionId: string;
      sectionName: string;
      sectionType: SectionType;
    }
  | {
      kind: "not_found";
      sectionSlug: string;
    }
  | {
      kind: "ambiguous";
      sectionSlug: string;
      sectionIds: Array<string>;
    };

function resolveSectionName(
  state: SectionSlugProjectState,
  sectionId: string,
  nameOverrides: Record<string, string> | null,
): string {
  const override = nameOverrides?.[sectionId];
  if (override !== undefined) {
    return override;
  }
  return state.sections[sectionId]?.name ?? "";
}

export function resolveSectionFullPathName(
  state: SectionSlugProjectState,
  sectionId: string,
  nameOverrides: Record<string, string> | null,
): string {
  if (!state.sections[sectionId]) {
    return "";
  }
  if (!(sectionId in state.parentSectionMap)) {
    return resolveSectionName(state, sectionId, nameOverrides);
  }
  let parentId = state.parentSectionMap[sectionId];
  if (!parentId) {
    return resolveSectionName(state, sectionId, nameOverrides);
  }
  let childId = sectionId;
  let output = "";
  while (parentId) {
    const childImpl = getCurrEffectiveSectionImpl(state, childId);
    if (childImpl.type === SectionTypeEnum.ListRoot) {
      const siblings = getSectionChildren(state, parentId);
      const idx = siblings.indexOf(childId);
      output = `[${idx}]${output}`;
    } else {
      const childName = resolveSectionName(state, childId, nameOverrides);
      output = `["${childName}"]${output}`;
    }
    childId = parentId;
    parentId = state.parentSectionMap[parentId];
  }
  const childName = resolveSectionName(state, childId, nameOverrides);
  return `${childName}${output}`;
}

export function getSectionSlugIndex(
  state: SectionSlugProjectState,
): SectionSlugIndex {
  const slugToIds: Record<string, Array<string>> = {};
  for (const id of Object.keys(state.sections)) {
    const fullPathName = resolveSectionFullPathName(state, id, null);
    const slug = sanitizeNameForSlug(fullPathName);
    if (!slugToIds[slug]) {
      slugToIds[slug] = [];
    }
    slugToIds[slug].push(id);
  }

  const childrenByParent: Record<string, Array<string>> = {};
  for (const [childId, parentId] of Object.entries(state.parentSectionMap)) {
    if (!parentId || !(childId in state.sections)) {
      continue;
    }
    if (!childrenByParent[parentId]) {
      childrenByParent[parentId] = [];
    }
    childrenByParent[parentId].push(childId);
  }

  return { slugToIds, childrenByParent };
}

export function collectDescendantSectionIds(
  childrenByParent: Record<string, Array<string>>,
  rootId: string,
): Set<string> {
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    const children = childrenByParent[currentId];
    if (children) {
      stack.push(...children);
    }
  }
  return visited;
}

export function getReservedStandaloneSectionSlugError(
  _slug: string,
): string | null {
  return null;
}

export function getReservedStandaloneSectionSlugErrorForName(
  name: string,
): string | null {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return null;
  }
  return getReservedStandaloneSectionSlugError(
    sanitizeNameForSlug(normalizedName),
  );
}

export function resolveStandaloneSectionSlug(
  state: SectionSlugProjectState,
  sectionSlug: string,
): StandaloneSectionSlugResolution {
  const matchingIds = getSectionSlugIndex(state).slugToIds[sectionSlug] ?? [];

  if (matchingIds.length === 0) {
    return {
      kind: "not_found",
      sectionSlug,
    };
  }

  if (matchingIds.length > 1) {
    return {
      kind: "ambiguous",
      sectionSlug,
      sectionIds: [...matchingIds],
    };
  }

  const sectionId = matchingIds[0];
  if (sectionId === undefined) {
    return {
      kind: "not_found",
      sectionSlug,
    };
  }
  const section = state.sections[sectionId];
  if (!section) {
    return {
      kind: "not_found",
      sectionSlug,
    };
  }

  return {
    kind: "found",
    sectionId,
    sectionName: section.name,
    sectionType: getCurrEffectiveSectionImpl(state, sectionId).type,
  };
}
