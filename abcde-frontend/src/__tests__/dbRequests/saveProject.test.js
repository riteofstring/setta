import { loadOneProject } from "abcde-test/src/loaders/frontend/loaders";
import { getProjectData } from "thunks/save";
import { createMainContainer } from "__tests__utils/createMainContainer";

test("The output of getProjectData should match the test data", async () => {
  await createMainContainer();
  const output = getProjectData();
  const correctOutput = await loadOneProject({ forSavingToBackend: true });
  const { userCodeInfoMaps, ...theRest } = correctOutput;
  expect(output).toEqual(theRest);
});
