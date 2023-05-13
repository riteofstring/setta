import { loadOneProject } from "abcde-test/src/loadTestData";
import { loadProjectState } from "thunks/loadProjectState";
import { resetAllStores } from "thunks/reset";

export async function loadTestDataIntoState(customValues) {
  resetAllStores();
  const testData = await loadOneProject({});
  loadProjectState({ ...testData, ...customValues });
}
