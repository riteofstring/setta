import { loadTestData } from "abcde-test/src/loaders/loaders";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { ReactFlowProvider } from "react-flow-renderer";
import { loadProjectState } from "thunks/loadProjectState";
import { resetAllStores } from "thunks/reset";

export async function loadTestDataIntoState(customValues) {
  resetAllStores();
  const testData = await loadTestData({
    projectName: "simpleTrainTest",
    configName: "simpleConfig1",
    format: "loadProjectToFrontend",
  });
  loadProjectState({ ...testData, ...customValues });
}

export function getReactFlowProvider() {
  return ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider>;
}

export function sectionIdFromName(name) {
  const sections = useSectionInfos.getState().x;
  return _.find(sections, (x) => x.name === name).id;
}

export class ResizeObserver {
  observe() {
    // do nothing
  }
  unobserve() {
    // do nothing
  }
  disconnect() {
    // do nothing
  }
}
