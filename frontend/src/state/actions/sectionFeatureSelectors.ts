import { type ZustandProjectState } from "state/definitions";
import { isBaseParamCodeObjImpl, SectionTypeEnum } from "utils/generatedTypes";
import { getCodeObjCore } from "./sectionEffectiveImplCore";
import { getCurrEffectiveCodeObjImpl } from "./sectionEffectiveImplSelectors";

export type ManagedChatSectionAuthorityState = Pick<
  ZustandProjectState,
  "sections" | "sectionVariants" | "sectionImpls"
> & {
  projectConfig: Pick<
    ZustandProjectState["projectConfig"],
    "sectionVariantMap"
  >;
};

export function isManagedChatSection(
  state: ManagedChatSectionAuthorityState,
  sectionId: string,
): boolean {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return false;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return false;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return false;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return false;
  }
  const effectiveType =
    (variant.modifier as { type?: unknown } | undefined)?.type ??
    (core.sharedModifier as { type?: unknown } | undefined)?.type ??
    (impl as { type?: unknown }).type;
  if (effectiveType !== SectionTypeEnum.Chat) {
    return false;
  }
  const managed =
    (variant.modifier as { managed?: unknown } | undefined)?.managed ??
    (core.sharedModifier as { managed?: unknown } | undefined)?.managed ??
    (impl as { managed?: unknown }).managed;
  return Boolean(managed);
}

export function getParamDisplayName(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
) {
  const codeObj = getCodeObjCore(state, codeObjId);
  if (!state.projectConfig.showParamDisplayNames) {
    return codeObj.name;
  }
  const impl = getCurrEffectiveCodeObjImpl(state, sectionId, codeObjId);
  if (isBaseParamCodeObjImpl(impl) && impl.coreNameEditable) {
    return codeObj.name;
  }
  const trimmedDisplayName = codeObj.displayName.trim();
  if (trimmedDisplayName.length > 0) {
    return codeObj.displayName;
  }
  return codeObj.name;
}
