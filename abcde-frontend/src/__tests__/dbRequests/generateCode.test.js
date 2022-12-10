import { getProjectDataToGenerateCode } from "thunks/generateCode";
import { createMainContainer } from "__tests__utils/createMainContainer";
import { loadOneProject } from "__tests__utils/loadTestData.mjs";

test("The output of getProjectDataToGenerateCode should match the test data", async () => {
  await createMainContainer({});
  const output = getProjectDataToGenerateCode();
  const correctOutput = await loadOneProject({ forCodeGen: true });
  const { userCodeInfoMaps, projectConfigCodeInfoMaps, ...theRest } =
    correctOutput;
  expect(output).toEqual(theRest);
});
