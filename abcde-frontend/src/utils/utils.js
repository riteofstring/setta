export function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
}

export function checkGlobalCurrEquality(sectionId, moduleName, objName, name) {
  return (prev, next) => {
    let prevParam = null;
    let nextParam = null;
    try {
      prevParam = prev[sectionId][moduleName][objName][name];
    } catch (err) {}
    try {
      nextParam = next[sectionId][moduleName][objName][name];
    } catch (err) {}
    return prevParam === nextParam;
  };
}
