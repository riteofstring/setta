import { useProjectState } from "state/definitions";
import { SETTINGS_PROJECT_NAME } from "utils/constants";
import { route_update_from_frontend } from "utils/generatedEndpoints";
import { createNewId } from "utils/idNameCreation";
import { asyncDebounce } from "utils/utils";
import { getProjectData } from "./saveProject";

async function getProjectDataToGenerateCode({
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
  //     if (includeDrawings && getSectionType(x.id) === UITypeNameEnum.DRAW) {
  //       currSection.drawing = await requestBase64FromCanvas(x.id);
  //     }
  //     if (includeLatestChatMessages && getSectionType(x.id) === UITypeNameEnum.CHAT) {
  //       // this property just needs to exist when the code is first imported
  //       currSection.latestChatMessage = null;
  //     }
  //     sections[x.id] = currSection;
  //   }
  //   project.sections = sections;
  // }
  return project;
}

export const updateBackendProjectState = asyncDebounce(
  async () => {
    if (
      useProjectState.getState().projectConfig.name === SETTINGS_PROJECT_NAME
    ) {
      return;
    }
    const projectState = await getProjectDataToGenerateCode({});
    const requestRenameRefactor =
      useProjectState.getState().requestRenameRefactor;
    await route_update_from_frontend({
      messageId: createNewId(),
      projectState,
      modCount: useProjectState.getState().modCount,
      requestRenameRefactor,
    });
    // have to reset requestRenameRefactor to false, in case it was set to true
    useProjectState.setState((state) => {
      state.requestRenameRefactor = false;
    });
  },
  200,
  { leading: true },
);
