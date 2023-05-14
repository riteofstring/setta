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
  const { userCodeInfoMaps, ...theRest } = correctOutput;
  expect(output.ev).toEqual(correctOutput.ev);
  // expect(output).toEqual(theRest);
});
