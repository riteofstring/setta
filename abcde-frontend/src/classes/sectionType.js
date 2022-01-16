import { rootTypeToChildType, isRoot } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import { MutableInfo } from "./mutableInfo";

function emptySpecs() {
  return { objects: [], parameters: [] };
}

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

function initSpecs(inSpecs) {
  const specs = convertSpecsToDict(inSpecs);
  const hasObjects = specs.objects?.length > 0;
  return [specs, hasObjects];
}

function initIds(specs) {
  return [[...specs.objects], [...specs.parameters]];
}

function initChildType(parentCls) {
  let childType = {};
  const childName = rootTypeToChildType[parentCls.name];
  if (childName) {
    const parentIsRoot = isRoot(parentCls.name);
    const uiColId = parentIsRoot ? parentCls.uiTypeCollectionId : createNewId();
    const sectionSpecs = parentIsRoot ? parentCls.specs : emptySpecs();

    childType = new SectionType({
      id: createNewId(),
      name: childName,
      sectionSpecs,
      uiTypeCollectionId: uiColId,
    });
  }
  return childType;
}

export class SectionType extends MutableInfo {
  constructor({ id, name, sectionSpecs, uiTypeCollectionId }) {
    super();
    this.id = id;
    this.name = name;
    [this.specs, this.hasObjects] = initSpecs(sectionSpecs);
    [this.objCollectionIds, this.paramCollectionIds] = initIds(this.specs);
    this.uiTypeCollectionId = uiTypeCollectionId;
    this.childType = initChildType(this);
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
