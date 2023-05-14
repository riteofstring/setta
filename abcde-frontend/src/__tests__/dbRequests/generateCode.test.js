import { loadTestData } from "abcde-test/src/loaders/loaders";
import { getProjectDataToGenerateCode } from "thunks/generateCode";
import { loadTestDataIntoState } from "__tests__utils/utils";

test("The output of getProjectDataToGenerateCode should match the test data", async () => {
  await loadTestDataIntoState();
  const output = getProjectDataToGenerateCode();
  const correctOutput = await loadTestData({
    projectName: "simpleTrainTest",
    configName: "simpleConfig1",
    format: "codeGen",
  });
  const { userCodeInfoMaps, outputGroups, outputs, runs, ...theRest } =
    correctOutput;
  expect(Object.keys(output).sort()).toEqual(Object.keys(theRest).sort());
  for (const k of Object.keys(output)) {
    expect(output[k], `${k} doesn't match`).toEqual(correctOutput[k]);
  }
});
