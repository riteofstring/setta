import _ from "lodash";
import {
  getCurrEffectiveSectionImpl,
  getCurrSectionVariantId,
} from "state/actions/sectionInfos";
import { useProjectState, useResizeEvent } from "state/definitions";
import { useTemporaryMiscState } from "state/stores/layoutInteractionStores";
import { useSettings } from "state/stores/uiPreferenceStores";
import {
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getMaxSectionHeight,
  getMaxSectionWidth,
  getMetaControlSizingPolicyEntry,
  getMinSectionHeight,
  getMinSectionWidth,
  getSectionSizeMode,
  resolveMetaControlSizeMode,
  type SizeMode,
} from "./sectionSizingPolicyDims";
import { getIsTwitterSection } from "./social";

const DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 36;
const LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;
const UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED = 36;
// Accounts for the fixed top + bottom gutters in the section grid.
const SECTION_GRID_GUTTER_HEIGHT = 8;

export function useSectionMinMaxDims(sectionId: string) {
  const sizingPolicy = useSettings((x) => x.sectionSizingPolicy, _.isEqual);
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  const sectionHeaderHeight = useTemporaryMiscState((x) => {
    const height = x[getSectionHeaderHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const sectionSearchHeight = useTemporaryMiscState((x) => {
    const height = x[getSectionSearchHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const kwargsControlsHeight = useTemporaryMiscState((x) => {
    const height = x[getKwargsControlsHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const paramsFixedHeight = useTemporaryMiscState((x) => {
    const height = x[getParamsFixedHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  return useProjectState((x) => {
    const isTwitter = getIsTwitterSection(sectionId, x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const sectionType = impl.type;
    const hideSearch = impl.hideSearch;
    const hideParams = impl.hideParams;
    const isMinimized = impl.isMinimized;

    let minHeight = getMinSectionHeight({
      sectionType,
      hideSearch,
      hideParams,
      isMinimized,
      sizingPolicy,
    });

    const policyMaxHeight = getMaxSectionHeight({
      sectionType,
      isMinimized,
      sizingPolicy,
    });
    const isAutoHeight = impl.size.height === "auto";
    const isResizing = resizeEvent === "start";
    const autoMaxHeight = sizingPolicy.globals.autoMaxHeight;

    let minWidth = getMinSectionWidth({
      sectionType,
      sizingPolicy,
    });
    const maxWidth = getMaxSectionWidth({
      sectionType,
      sizingPolicy,
    });

    if (!isMinimized && isBaseSectionWithParamsImpl(impl) && !hideParams) {
      const variantId = getCurrSectionVariantId(x, sectionId, true);
      const shown = x.shownParamIds[variantId];
      let requiredParamsHeight = 0;
      let hasPinnedParams = false;
      if (shown) {
        const pinned = shown.pinned;
        const edgeInputSet = new Set(impl.edgeInputParams);
        hasPinnedParams = pinned.topLevelParamIds.some(
          (paramId) => !edgeInputSet.has(paramId),
        );
      }
      const showsUnpinnedParams = !impl.hideUnpinnedParams;
      const baseUnpinnedMinHeight = Number.isFinite(
        sizingPolicy.globals.unpinnedParamsAreaMinHeight,
      )
        ? sizingPolicy.globals.unpinnedParamsAreaMinHeight
        : DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT;
      const normalizedUnpinnedMinHeight =
        baseUnpinnedMinHeight === LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT
          ? DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
          : baseUnpinnedMinHeight;
      const resolvedUnpinnedPolicyMinHeight =
        hasPinnedParams &&
        normalizedUnpinnedMinHeight === DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
          ? UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED
          : normalizedUnpinnedMinHeight;
      const resolvedUnpinnedMinHeight = showsUnpinnedParams
        ? resolvedUnpinnedPolicyMinHeight
        : 0;
      const fixedTopHeight =
        sectionHeaderHeight +
        sectionSearchHeight +
        kwargsControlsHeight +
        SECTION_GRID_GUTTER_HEIGHT;
      requiredParamsHeight += fixedTopHeight;
      requiredParamsHeight += paramsFixedHeight;
      if (resolvedUnpinnedMinHeight > 0) {
        requiredParamsHeight += resolvedUnpinnedMinHeight;
      }
      if (requiredParamsHeight > 0) {
        minHeight = Math.max(minHeight, requiredParamsHeight);
      }
    }

    let metaControlSizeMode: SizeMode | null = null;
    if (sectionType === SectionTypeEnum.MetaControl) {
      const metaControlEntry = getMetaControlSizingPolicyEntry({
        projectState: x,
        sectionId,
        controlParamId: impl.metaControlParamId,
        sizingPolicy,
      });
      if (metaControlEntry) {
        minHeight = Math.max(minHeight, metaControlEntry.minHeight);
        minWidth = Math.max(minWidth, metaControlEntry.minWidth);
      }
      metaControlSizeMode = resolveMetaControlSizeMode(metaControlEntry);
    }

    const cappedAutoMaxHeight = Math.min(policyMaxHeight, autoMaxHeight);
    const maxHeight =
      isAutoHeight && !isResizing
        ? Math.max(minHeight, cappedAutoMaxHeight)
        : Math.max(minHeight, policyMaxHeight);

    const sizeMode = getSectionSizeMode({
      sectionType,
      hideParams,
      isTwitter,
      metaControlSizeMode,
    });

    return { minHeight, maxHeight, minWidth, maxWidth, sizeMode };
  }, _.isEqual);
}
