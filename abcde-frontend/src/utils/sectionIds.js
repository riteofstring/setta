const NESTED = "~";
const SEPARATOR = ",";
const MODULE = "M:";
const OBJ = "O:";
const PARAM = "P:";

export const createId = (sectionName, moduleName, objName, paramName) => {
  return (
    sectionName +
    NESTED +
    MODULE +
    moduleName +
    SEPARATOR +
    OBJ +
    objName +
    SEPARATOR +
    PARAM +
    paramName
  );
};

const parseNestedId = (id) => {
  const splitId = id.split(SEPARATOR);
  const moduleName = splitId[0].split(MODULE)[1];
  const objName = splitId[1].split(OBJ)[1];
  const paramName = splitId[2].split(PARAM)[1];
  return { moduleName, objName, paramName };
};

const parseId = (id) => {
  const splitId = id.split(NESTED);
  const output = [splitId[0]];
  for (let i = 1; i < splitId.length; i++) {
    output.push(parseNestedId(splitId[i]));
  }
  return output;
};

export const getSection = (sections, id) => {
//   console.log("sections", sections);
  const idParsed = parseId(id);
//   console.log("idParsed", idParsed)
  const rootSectionName = idParsed[0];
//   console.log("rootSectionName", rootSectionName)
  let currSection = sections[rootSectionName];
//   console.log("currSection", currSection)
  for (let i = 1; i < idParsed.length; i++) {
    const { moduleName, objName, paramName } = idParsed[i];
    currSection =
      currSection.moduleInfos[moduleName].objs[objName].params[paramName]
        .type;
  }
//   console.log("returning", currSection)
  return currSection;
};
