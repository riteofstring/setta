import { getProjectData } from "thunks/save";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";
import { loadOneProject } from "__tests__utils/loadTestData.mjs";

test("The output of getProjectData should match the test data", async () => {
  const { store } = await createStoreWrapperWithData();
  const output = getProjectData(store.getState());
  const correctOutput = await loadOneProject({ forSavingToBackend: true });
  const { globalDefaults, projectDefaults, ...theRest } = correctOutput;
  expect(output).toEqual(theRest);
});
