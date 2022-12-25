import { loadOneProject } from "abcde-test/src/loadTestData";
import { getProjectDataToGenerateCode } from "thunks/generateCode";
import { createMainContainer } from "__tests__utils/createMainContainer";

test("The output of getProjectDataToGenerateCode should match the test data", async () => {
  await createMainContainer({});
  const output = getProjectDataToGenerateCode();
  const correctOutput = await loadOneProject({ forCodeGen: true });
  const { userCodeInfoMaps, ...theRest } = correctOutput;
  expect(output).toEqual(theRest);
});
