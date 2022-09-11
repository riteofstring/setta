import defaultDefaults from "__tests__data/simpleTrainTest/DefaultDefaults.json";
import globalDefaults from "__tests__data/simpleTrainTest/GlobalDefaults.json";
import packages from "__tests__data/simpleTrainTest/NewPackages";
import projectDefaults from "__tests__data/simpleTrainTest/ProjectDefaults.json";
import uiData from "__tests__data/simpleTrainTest/UI.json";

export function loadTestData() {
  return {
    packages,
    defaultDefaults,
    globalDefaults,
    projectDefaults,
    uiData,
  };
}
