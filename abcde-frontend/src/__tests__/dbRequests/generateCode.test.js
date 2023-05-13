import { loadOneProject } from "abcde-test/src/loaders/frontend/loaders";
import { getProjectDataToGenerateCode } from "thunks/generateCode";
import { loadTestDataIntoState } from "__tests__utils/utils";

test("The output of getProjectDataToGenerateCode should match the test data", async () => {
  await loadTestDataIntoState();
  const output = getProjectDataToGenerateCode();
  const correctOutput = await loadOneProject({ forCodeGen: true });
  const { userCodeInfoMaps, ...theRest } = correctOutput;
  console.log(theRest.sections);
  expect(output.sections).toEqual(theRest.sections);
});
