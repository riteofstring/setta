import {
  LIST,
  LIST_NESTED_OBJECT,
  LIST_ROOT,
  SECTION,
} from "../utils/constants";
import { nullOrUndefined } from "../utils/utils";
import { convertSpecsToDict } from "./immutableInfo";

function getCollectionIds(specs, allCollections) {
  return specs ? specs.map((x) => allCollections.nameToId[x]) : [];
}

export class SectionType {
  constructor({
    id,
    name,
    allObjCollections,
    allParamCollections,
    parentSectionType,
    paramUIType,
    paramUITypeConfig,
    uiSpecs,
    parentIsSection,
  }) {
    this.id = id;
    this.initName(name, parentSectionType, paramUIType);
    this.initSpecs(paramUITypeConfig, uiSpecs, parentIsSection);
    this.initIds(allObjCollections, allParamCollections);
    this.hasObjects = "objects" in this.specs;
  }

  initIds(allObjCollections, allParamCollections) {
    this.objCollectionIds = [];
    this.paramCollectionIds = [];
    if (allObjCollections) {
      this.objCollectionIds = getCollectionIds(
        this.specs.objects,
        allObjCollections
      );
    }
    if (allParamCollections) {
      this.paramCollectionIds = getCollectionIds(
        this.specs.parameters,
        allParamCollections
      );
    }
  }

  initName(name, parentSectionType, paramUIType) {
    if (name) {
      this.name = name;
      return;
    }
    if (parentSectionType?.name === LIST_ROOT) {
      this.name = LIST;
      return;
    }
    if (paramUIType?.name === LIST_NESTED_OBJECT) {
      this.name = LIST_ROOT;
      return;
    }
    this.name = SECTION;
  }

  initSpecs(paramUITypeConfig, uiSpecs, parentIsSection) {
    this.specs = paramUITypeConfig;
    if (parentIsSection) {
      if (nullOrUndefined(this.specs)) {
        this.specs = parentSectionInfo.specs;
      }
    } else if (uiSpecs) {
      this.specs = uiSpecs.get(this.name);
    }
    this.specs = convertSpecsToDict(this.specs);
  }
}
