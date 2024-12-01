import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { getDefaultDisplayMode } from "state/hooks/uiTypes";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createVarName, maybeNewId } from "../idNameCreation";

export function newSectionInfo({
  id,
  name,
  children = [],
  size = { width: "auto", height: "auto" },
  position,
  zIndex = 0,
  parentId = null,
  variantId,
  uiTypeId = BASE_UI_TYPE_IDS.SECTION,
  uiTypeColId,
  social = null,
  artifacts = [],
  variantIds = [],
  paramSweepSectionId = null,
  nonPresetUITypeIds = [],
  codeLanguage = "",
  configLanguage = "python",
  isFrozen = false,
  isHorizontalOrientation = false,
  hideParams = false,
  hideSearch = false,
  hideUnpinnedParams = false,
  displayMode = null,
  pinnedAreaHeight = "auto",
  isMinimized = false,
  canvasSettings = {},
  isTemporary = false,
  renderMarkdown = false,
  positionAndSizeLocked = false,
  jsonSource = null,
  selectedVariantIds = {},
  paramFilter = "",
}) {
  const existingVarNames = _.map(useSectionInfos.getState().x, (s) => s.name);
  const _variantId = maybeNewId(variantId);
  const _variantIds = [...variantIds, _variantId];
  const _displayMode = displayMode ?? getDefaultDisplayMode(uiTypeId);

  return {
    id: maybeNewId(id),
    name: name ? name : createVarName(existingVarNames),
    children,
    size,
    position,
    zIndex,
    parentId,
    variantId: _variantId,
    uiTypeId,
    uiTypeColId: maybeNewId(uiTypeColId),
    social,
    artifacts,
    codeLanguage,
    configLanguage,
    variantIds: _variantIds,
    paramSweepSectionId,
    nonPresetUITypeIds,
    isFrozen,
    isHorizontalOrientation,
    hideParams,
    hideSearch,
    hideUnpinnedParams,
    displayMode: _displayMode,
    pinnedAreaHeight,
    isMinimized,
    canvasSettings,
    isTemporary,
    renderMarkdown,
    positionAndSizeLocked,
    jsonSource,
    selectedVariantIds,
    paramFilter,
  };
}
