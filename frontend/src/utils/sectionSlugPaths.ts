import type { ZustandProjectState } from "state/definitions";
import {
  type BaseSectionImplUnion,
  type SectionType,
} from "utils/generatedTypes";

type SectionSlugProjectState = Pick<
  ZustandProjectState,
  "sections" | "sectionImpls" | "sectionVariants" | "projectConfig"
>;

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

function getSectionEffectiveImplForSlugPath(
  state: SectionSlugProjectState,
  sectionId: string,
): BaseSectionImplUnion {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    throw new Error(`Missing section variant for section ${sectionId}.`);
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    throw new Error(`Missing section variant ${variantId}.`);
  }
  const baseImpl = state.sectionImpls[variant.impl];
  if (!baseImpl) {
    throw new Error(`Missing section impl ${variant.impl}.`);
  }
  const core = state.sections[sectionId];
  if (!core) {
    throw new Error(`Missing section core ${sectionId}.`);
  }
  return {
    ...baseImpl,
    ...core.sharedModifier,
    ...variant.modifier,
  } as BaseSectionImplUnion;
}

export function resolveStandaloneSectionSlug(
  state: SectionSlugProjectState,
  sectionSlug: string,
): StandaloneSectionSlugResolution {
  const matchingIds =
    state.projectConfig.sectionIdsByPathSlug?.[sectionSlug] ?? [];

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
    sectionType: getSectionEffectiveImplForSlugPath(state, sectionId).type,
  };
}
