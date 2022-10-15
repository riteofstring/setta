import defaultDefaults from "__tests__data/simpleTrainTest/DefaultDefaults.json";
import globalDefaults from "__tests__data/simpleTrainTest/GlobalDefaults.json";
import objCollections from "__tests__data/simpleTrainTest/ObjCollections.json";
import packages from "__tests__data/simpleTrainTest/Packages.json";
import paramCollections from "__tests__data/simpleTrainTest/ParamCollections.json";
import projectDefaults from "__tests__data/simpleTrainTest/ProjectDefaults.json";
import uiData from "__tests__data/simpleTrainTest/UI.json";

export function loadTestData() {
  return {
    packages,
    objCollections,
    paramCollections,
    defaultDefaults,
    globalDefaults,
    projectDefaults,
    uiData,
  };
}
