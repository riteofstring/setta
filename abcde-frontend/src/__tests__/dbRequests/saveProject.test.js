import { getProjectData } from "thunks/save";
import { loadOneProject } from "__tests__utils/loadTestData.mjs";
import { createStoreWrapperWithData } from "__tests__utils/utils";

test("The output of getProjectData should match the test data", async () => {
  const { store } = await createStoreWrapperWithData({});
  const output = getProjectData(store.getState());
  const correctOutput = await loadOneProject({ forSavingToBackend: true });
  const { userCodeInfoMaps, projectConfigCodeInfoMaps, ...theRest } =
    correctOutput;
  expect(output).toEqual(theRest);
});
