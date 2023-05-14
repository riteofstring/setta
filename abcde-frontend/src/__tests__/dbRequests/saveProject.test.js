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
  expect(Object.keys(output).sort()).toEqual(Object.keys(theRest).sort());
  for (const k of Object.keys(output)) {
    expect(output[k], `${k} doesn't match`).toEqual(correctOutput[k]);
  }
});
