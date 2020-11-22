import createGlobalCurr from "./globalCurr";

const globalCurrObj = createGlobalCurr({
  parentName: "globalCurrModule",
  childName: "globalCurrParams",
});

export default globalCurrObj;
