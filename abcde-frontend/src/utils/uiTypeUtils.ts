import { rootTypeToChildSubType, SECTION } from "abcde-utils/src/constants";
import { OriginInfoIdType, UITypeType } from "abcde-utils/src/types/uiType";
import { createNewId } from "abcde-utils/src/utils";
import _ from "lodash";

function cloneRootUIType(parentUIType, parentId) {
  const uiType = _.cloneDeep(parentUIType);
  uiType.id = createNewId();
  uiType.type = SECTION;
  uiType.config.uiTypeColId = createNewId();
  uiType.config.subType = rootTypeToChildSubType[parentUIType.type];
  uiType.presetType = null;
  uiType.originInfoId = createSectionOriginInfoId(parentId);
  uiType.isForChildOfOriginInfoId = true;
  return uiType;
}

export function getChildUITypeId(
  parentUIType,
  parentId,
  setUIType,
  setOneConfig
) {
  // If a childUIType was created before, then the parentUIType will have its id
  const { childUITypeId } = parentUIType.config;
  if (childUITypeId) {
    return childUITypeId;
  }

  // Otherwise, a child ui type needs to be created
  const newUIType = cloneRootUIType(parentUIType, parentId);
  const id = newUIType.id;
  setOneConfig({
    uiTypeId: parentUIType.id,
    configName: "childUITypeId",
    newValueFn: () => id,
  });
  setUIType({ uiType: newUIType });
  return id;
}

export function createSectionOriginInfoId(sectionId: string): OriginInfoIdType {
  return { sectionId, uiTypeColId: null, paramInfoId: null };
}

export function createParamOriginInfoId(
  uiTypeColId: string,
  paramInfoId: string
): OriginInfoIdType {
  return {
    sectionId: null,
    uiTypeColId,
    paramInfoId,
  };
}

export function cloneNewUIType({
  uiType,
  name = "",
  config,
  presetType = null,
  originInfoId = { sectionId: null, uiTypeColId: null, paramInfoId: null },
  isForChildOfOriginInfoId = false,
}: Partial<UITypeType> & { uiType: UITypeType }) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.name = name;
  newUIType.presetType = presetType;
  newUIType.originInfoId = originInfoId;
  if (!_.isNil(config)) {
    newUIType.config = config;
  }
  newUIType.isForChildOfOriginInfoId = isForChildOfOriginInfoId;
  return newUIType;
}

// Root sections and child behavior:

// ##### Root controlling children #####
// The first child section causes a new ui type to be created.
// This new ui type id is added to the root ui type's config as "childUITypeId".
// All future child sections now use this childUITypeId.
// So the default is that all children use the same ui type.
// Whenever the root config changes, the child config also changes.
// Because all the children are using the same ui type, all children's configs changes when the root config changes.

// ##### Children becoming independent #####
// Modifying a child's config makes it become independent of the root and the siblings.
// So now if you modify the root config, the independent child is not affected.

// OriginInfoId behavior:

// Approach 1:
// A list root creates a child uitype.
// The child uiType's originInfoId is the list root's originInfoId.
// The child uiType also has isForChildOfOriginInfoId=true.
// Available uitypes a section match by originInfoIdMatches and isForChildOfOriginInfoId=false
// AND originInfoIdMatches and isForChildOfOriginInfoId=true
// The problem with this is that child sections will see "lingering" ui types when parents change from list root to something else.
// These lingering ui types can't be deleted, because the child sections are stored in history
// and need access to those ui types if they are ever re-rendered (i.e. if the parent becomes a list root again).
// So in addition checking isForChildOfOriginInfoId, a section needs to check if its parent is a root.
// The check is:
// (originInfoIdMatches && isForChildOfOriginInfoId=false) || (parentIsRoot && originInfoIdMatches && isForChildOfOriginInfoId=true)

// originInfoId format: {uiTypeColId, paramInfoId} or {sectionId}
// When changing a param's uitype, the uiTypeColId is from the section's uiType, and paramInfoId is from the param.
// When changing a nested param's uitype, the uiTypeColId is from the PARENT section's uiType, and paramInfoId is from the param.
// When changing a section not associated with a param, use sectionId
