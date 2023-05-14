import { loadTestData } from "abcde-test/src/loaders/loaders";
import { compareObjs } from "abcde-utils/src/testUtils";
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
  compareObjs(expect, output, theRest);
});
