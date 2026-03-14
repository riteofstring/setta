import type { ZustandProjectState } from "state/definitions";
import type { Core, ImplArgsBundleMap, Variant } from "utils/generatedTypes";

import {
  getCodeObjCore,
  getCodeObjImpl,
  getCurrCodeObjVariant,
  getCurrSectionVariant,
  getEffectiveImpl,
  getSectionCore,
  getSectionImpl,
  getSectionVariant,
  invalidateEffectiveImplCache,
} from "./sectionEffectiveImpls";

export function setEffectiveImplValue<K extends keyof ImplArgsBundleMap>(
  impl: ImplArgsBundleMap[K]["impl"],
  core: Core,
  variant: Variant,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const currentImpl = getEffectiveImpl(impl, core, variant);
  for (const [key, value] of Object.entries(args)) {
    const currentValue = currentImpl[key];
    const nextValue = typeof value === "function" ? value(currentValue) : value;
    if (!core.unsharedKeys.includes(key)) {
      core.sharedModifier[key] = nextValue;
    } else if (!impl.isPreset) {
      impl[key] = nextValue;
    } else {
      variant.modifier[key] = nextValue;
    }
  }
  invalidateEffectiveImplCache(impl);
  return getEffectiveImpl(impl, core, variant);
}

export function setCurrEffectiveSectionImplValue<
  K extends keyof ImplArgsBundleMap,
>(
  state: ZustandProjectState,
  sectionId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getCurrSectionVariant(state, sectionId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}

export function setSectionVariantImplValue<K extends keyof ImplArgsBundleMap>(
  state: ZustandProjectState,
  sectionId: string,
  variantId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getSectionVariant(state, variantId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}

export function setCurrEffectiveCodeObjImplValue<
  K extends keyof ImplArgsBundleMap,
>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getCurrCodeObjVariant(state, sectionId, codeObjId);
  const impl = getCodeObjImpl(state, variant.impl);
  const core = getCodeObjCore(state, codeObjId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}
