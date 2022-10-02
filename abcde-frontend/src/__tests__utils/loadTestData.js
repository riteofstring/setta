import baseUITypes from "__tests__data/BaseUITypes";
import globalDefaults from "__tests__data/simpleTrainTest/GlobalDefaults.json";
import packages from "__tests__data/simpleTrainTest/NewPackages";
import projectDefaults from "__tests__data/simpleTrainTest/ProjectDefaults.json";
import uiData from "__tests__data/simpleTrainTest/UI";

export function loadTestData() {
  return {
    packages,
    baseUITypes,
    globalDefaults,
    projectDefaults,
    uiData,
  };
}
