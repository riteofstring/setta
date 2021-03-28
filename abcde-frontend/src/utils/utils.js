export function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
}

export function getParameters(sectionInfo, moduleName, objName){
  let returnParameters = [];
  try {
    const paramSource =
      sectionInfo.moduleInfos[moduleName].objs[objName].params;
    for (let key of Object.keys(paramSource)) {
      returnParameters.push(paramSource[key]);
    }
  } catch (err) {}
  return returnParameters;
};
