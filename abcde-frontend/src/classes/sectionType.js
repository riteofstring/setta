import { immerable } from "immer";

import {
  LIST,
  LIST_NESTED_OBJECT,
  LIST_ROOT,
  SECTION,
} from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import { nullOrUndefined } from "../utils/utils";
import { convertSpecsToDict } from "./immutableInfo";

function getCollectionIds(specs, allCollections) {
  return specs ? specs.map((x) => allCollections.nameToId[x]) : [];
}

export class SectionType {
  [immerable] = true;
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
  }) {
    this.id = id;
    this.initName(name, paramUIType);
    this.initSpecs(
      paramUITypeConfig,
      topLevelSpecs,
      parentSectionType,
      parentIsSection
    );
    this.initIds(allObjCollections, allParamCollections);
    this.initChildType(
      allObjCollections,
      allParamCollections,
      paramUIType,
      paramUITypeConfig
    );
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

  initName(name, paramUIType) {
    if (name) {
      this.name = name;
      return;
    }
    if (paramUIType?.name === LIST_NESTED_OBJECT) {
      this.name = LIST_ROOT;
      return;
    }
    this.name = SECTION;
  }

  initSpecs(
    paramUITypeConfig,
    topLevelSpecs,
    parentSectionType,
    parentIsSection
  ) {
    this.specs = paramUITypeConfig;

    if (parentIsSection) {
      if (nullOrUndefined(this.specs)) {
        this.specs = Object.assign({}, parentSectionType.specs);
      }
    } else if (topLevelSpecs) {
      this.specs = topLevelSpecs;
    }
    this.specs = convertSpecsToDict(this.specs);
    this.hasObjects = this.specs.objects?.length > 0;
  }

  initChildType(
    allObjCollections,
    allParamCollections,
    paramUIType,
    paramUITypeConfig
  ) {
    this.childType = null;
    if (this.name === LIST_ROOT) {
      this.childType = new SectionType({
        id: createNewId(),
        name: LIST,
        allObjCollections,
        allParamCollections,
        parentSectionType: this,
        paramUIType,
        paramUITypeConfig,
        parentIsSection: true,
      });
    }
  }
}
