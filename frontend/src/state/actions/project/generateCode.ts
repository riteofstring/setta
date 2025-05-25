import { sendMessage } from "requests/websocket";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { createNewId } from "utils/idNameCreation";
import { asyncDebounce } from "utils/utils";
import { getProjectData } from "./saveProject";

export async function getProjectDataToGenerateCode({
  withArtifacts = false,
  includeDrawings = false,
  includeLatestChatMessages = false,
}) {
  const project = getProjectData({ withArtifacts });
  // if (includeDrawings || includeLatestChatMessages) {
  //   const sectionInfosState = useProjectState.getState().sections;
  //   const sections = {};
  //   for (const x of Object.values(sectionInfosState)) {
  //     const currSection = _.cloneDeep(x);
  //     if (includeDrawings && getSectionType(x.id) === C.DRAW) {
  //       currSection.drawing = await requestBase64FromCanvas(x.id);
  //     }
  //     if (includeLatestChatMessages && getSectionType(x.id) === C.CHAT) {
  //       // this property just needs to exist when the code is first imported
  //       currSection.latestChatMessage = null;
  //     }
  //     sections[x.id] = currSection;
  //   }
  //   project.sections = sections;
  // }
  return project;
}

export const updateBackendProjectState = asyncDebounce(async () => {
  const { projectConfigId, projectState } = await getProjectDataToGenerateCode(
    {},
  );
  const requestRenameRefactor =
    useProjectState.getState().requestRenameRefactor;
  sendMessage({
    id: createNewId(),
    content: { projectConfigId, projectState, requestRenameRefactor },
    messageType: C.WS_UPDATE_PROJECT_STATE,
  });
  // have to reset requestRenameRefactor to false, in case it was set to true
  useProjectState.setState((state) => {
    state.requestRenameRefactor = false;
  });
}, 200);
