import { SECTION, rootTypeToChildType, isRoot } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import { nullOrUndefined } from "../utils/utils";
import { MutableInfo } from "./mutableInfo";

function convertSpecsToDict(specs) {
  const output = { objects: [], parameters: [] };
  if (Array.isArray(specs)) {
    output.objects = specs;
  } else {
    if (specs?.objects) {
      output.objects = specs.objects;
    }
    if (specs?.parameters) {
      output.parameters = specs.parameters;
    }
  }
  return output;
}

function initName(name, paramUIType) {
  if (name) {
    return name;
  }
  if (paramUIType?.name) {
    return paramUIType.name;
  }
  return SECTION;
}

function initSpecs(
  paramUITypeConfig,
  topLevelSpecs,
  parentSectionType,
  parentIsSection
) {
  let specs = paramUITypeConfig;

  if (parentIsSection) {
    if (nullOrUndefined(specs)) {
      specs = Object.assign({}, parentSectionType.specs);
    }
  } else if (topLevelSpecs) {
    specs = topLevelSpecs;
  }
  specs = convertSpecsToDict(specs);
  const hasObjects = specs.objects?.length > 0;
  return [specs, hasObjects];
}

function initIds(specs) {
  return [[...specs.objects], [...specs.parameters]];
}

function initChildType(paramUIType, paramUITypeConfig, parentCls) {
  let childType = {};
  const childName = rootTypeToChildType[parentCls.name];
  if (childName) {
    const parentIsRoot = isRoot(parentCls.name);
    const uiColId = parentIsRoot ? parentCls.uiTypeCollectionId : createNewId();

    childType = new SectionType({
      id: createNewId(),
      name: childName,
      parentSectionType: parentCls,
      paramUIType,
      paramUITypeConfig,
      parentIsSection: parentCls,
      uiTypeCollectionId: uiColId,
    });
  }
  return childType;
}

export class SectionType extends MutableInfo {
  constructor({
    id,
    name,
    parentSectionType,
    paramUIType,
    paramUITypeConfig,
    topLevelSpecs,
    parentIsSection,
    uiTypeCollectionId,
  }) {
    super();
    this.id = id;
    this.name = initName(name, paramUIType);
    [this.specs, this.hasObjects] = initSpecs(
      paramUITypeConfig,
      topLevelSpecs,
      parentSectionType,
      parentIsSection
    );
    [this.objCollectionIds, this.paramCollectionIds] = initIds(this.specs);
    this.uiTypeCollectionId = uiTypeCollectionId;
    this.childType = initChildType(paramUIType, paramUITypeConfig, this);
    this.exportable = [
      "id",
      "name",
      "objCollectionIds",
      "paramCollectionIds",
      "specs",
      "uiTypeCollectionId",
    ];
  }
}
