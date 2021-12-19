import { SECTION, rootTypeToChildType } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import { nullOrUndefined } from "../utils/utils";
import { convertSpecsToDict } from "./immutableInfo";
import { MutableInfo } from "./mutableInfo";

function getCollectionIds(specs, allCollections) {
  return specs ? specs.map((x) => allCollections.nameToId[x]) : [];
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

function initIds(allObjCollections, allParamCollections, specs) {
  let objCollectionIds = [];
  let paramCollectionIds = [];
  if (allObjCollections) {
    objCollectionIds = getCollectionIds(specs.objects, allObjCollections);
  }
  if (allParamCollections) {
    paramCollectionIds = getCollectionIds(
      specs.parameters,
      allParamCollections
    );
  }
  return [objCollectionIds, paramCollectionIds];
}

function initChildType(
  allObjCollections,
  allParamCollections,
  paramUIType,
  paramUITypeConfig,
  parentCls
) {
  let childType = {};
  const childName = rootTypeToChildType[parentCls.name];
  if (childName) {
    childType = new SectionType({
      id: createNewId(),
      name: childName,
      allObjCollections,
      allParamCollections,
      parentSectionType: parentCls,
      paramUIType,
      paramUITypeConfig,
      parentIsSection: parentCls,
      uiTypeCollectionId: createNewId(),
    });
  }
  return childType;
}

export class SectionType extends MutableInfo {
  constructor({
    id,
    name,
    allObjCollections,
    allParamCollections,
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
    [this.objCollectionIds, this.paramCollectionIds] = initIds(
      allObjCollections,
      allParamCollections,
      this.specs
    );
    this.uiTypeCollectionId = uiTypeCollectionId;
    this.childType = initChildType(
      allObjCollections,
      allParamCollections,
      paramUIType,
      paramUITypeConfig,
      this
    );
    this.exportable = [
      "id",
      "name",
      "objCollectionIds",
      "paramCollectionIds",
      "specs",
    ];
  }
}
