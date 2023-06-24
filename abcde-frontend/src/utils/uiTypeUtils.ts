import { rootTypeToChildSubType, SECTION } from "abcde-utils/src/constants";
import { UITypeType } from "abcde-utils/src/types/uiType";
import { createNewId } from "abcde-utils/src/utils";
import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo, setSectionInfoAttr } from "thunks/sections/sections";

function cloneRootUIType(parentUIType, parentId) {
  const uiType = _.cloneDeep(parentUIType);
  uiType.id = createNewId();
  uiType.type = SECTION;
  uiType.config.uiTypeColId = createNewId();
  uiType.config.subType = rootTypeToChildSubType[parentUIType.type];
  uiType.presetType = null;
  return uiType;
}

export function getChildUITypeId(parentUIType, parentId) {
  // If a childUIType was created before, then the parentUIType will have its id
  const { childUITypeId } = parentUIType.config;
  if (childUITypeId) {
    return childUITypeId;
  }

  const uiTypesState = useUITypes.getState();

  // Otherwise, a child ui type needs to be created
  const newUIType = cloneRootUIType(parentUIType, parentId);
  const id = newUIType.id;
  uiTypesState.setOneConfig({
    uiTypeId: parentUIType.id,
    configName: "childUITypeId",
    newValueFn: () => id,
  });
  uiTypesState.setUIType({ uiType: newUIType });
  return id;
}

export function cloneNewUIType({
  uiType,
  name = "",
  config,
  presetType = null,
}: Partial<UITypeType> & { uiType: UITypeType }) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.name = name;
  newUIType.presetType = presetType;
  if (!_.isNil(config)) {
    newUIType.config = config;
  }
  return newUIType;
}

export function createNonPresetForSection({
  sectionId,
  currUIType,
  defaultName,
}) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    name: defaultName,
  });
  useUITypes.getState().setUIType({ uiType: newUIType });
  setSectionInfoAttr({
    sectionId,
    attr: "nonPresetUITypeIds",
    newValueFn: (v) => [...v, newUIType.id],
  });
  return newUIType;
}

export function createNonPresetForParam({
  sectionId,
  paramInfoId,
  currUIType,
  defaultName,
}) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    name: defaultName,
  });
  useUITypes.getState().setUIType({ uiType: newUIType });

  const { uiTypeColId } = getSectionInfo(sectionId);
  useParamInfos.getState().setNonPresetUITypeIds({
    collectionId: uiTypeColId,
    paramInfoId,
    newValueFn: (v) => [...v, newUIType.id],
  });
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
