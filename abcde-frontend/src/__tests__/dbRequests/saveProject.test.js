import { loadTestData } from "abcde-test/src/loaders/loaders";
import { getProjectData } from "thunks/save";
import { loadTestDataIntoState } from "__tests__utils/utils";

test("The output of getProjectData should match the test data", async () => {
  await loadTestDataIntoState();
  const output = getProjectData();
  const correctOutput = await loadTestData({
    projectName: "simpleTrainTest",
    configName: "simpleConfig1",
    format: "saveProjectToBackend",
  });
  const { userCodeInfoMaps, outputGroups, outputs, runs, ...theRest } =
    correctOutput;
  expect(output.project).toEqual(correctOutput.project);
  expect(output.projectConfig).toEqual(correctOutput.projectConfig);
  expect(output.ev).toEqual(correctOutput.ev);
  expect(output.evCols).toEqual(correctOutput.evCols);
  expect(output.uiTypes).toEqual(correctOutput.uiTypes);
  expect(output.uiTypeCols).toEqual(correctOutput.uiTypeCols);
  expect(output.kwargInfo).toEqual(correctOutput.kwargInfo);
  expect(output.kwargCols).toEqual(correctOutput.kwargCols);
  expect(output.sections).toEqual(correctOutput.sections);
  expect(output.sectionChilden).toEqual(correctOutput.sectionChilden);
  expect(output.sectionConfigs).toEqual(correctOutput.sectionConfigs);
  expect(output.sectionDescriptions).toEqual(correctOutput.sectionDescriptions);
  expect(output.projectConfigCodeInfoMaps).toEqual(
    correctOutput.projectConfigCodeInfoMaps
  );
  expect(Object.keys(output).sort()).toEqual(Object.keys(theRest).sort());
});
