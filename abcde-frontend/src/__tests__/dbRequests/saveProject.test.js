import { getProjectData } from "thunks/save";
import { createMainContainer } from "__tests__utils/createMainContainer";
import { loadOneProject } from "__tests__utils/loadTestData.mjs";

test("The output of getProjectData should match the test data", async () => {
  const { store } = await createMainContainer();
  const output = getProjectData(store.getState());
  const correctOutput = await loadOneProject({ forSavingToBackend: true });
  const { userCodeInfoMaps, projectConfigCodeInfoMaps, ...theRest } =
    correctOutput;
  expect(output).toEqual(theRest);
});
