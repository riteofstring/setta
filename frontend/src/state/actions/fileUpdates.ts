import { useAIStore, useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_load_section_json_source } from "utils/generatedEndpoints";
import {
  FileWatcherUpdateAPIKeys,
  FileWatcherUpdateGenPythonCode,
  FileWatcherUpdateUnion,
  FileWatchGroupNameEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { setEffectiveSectionImplValue } from "./sectionInfos";

export async function updateWithFileChanges(
  updatedFileInfo: FileWatcherUpdateUnion,
) {
  const { fileWatchGroupName } = updatedFileInfo;

  switch (fileWatchGroupName) {
    case FileWatchGroupNameEnum.jsonSource:
      return;
    case FileWatchGroupNameEnum.apiKeys:
      return apiKeyUpdateHandler(updatedFileInfo);
    case FileWatchGroupNameEnum.genPythonCode:
      return genPythonCodeUpdateHandler(updatedFileInfo);
    default:
      return fileWatchGroupName satisfies never;
  }
}

export async function loadJsonContents(variantIdsToLoad: Array<string>) {
  let codeInfo = null,
    codeInfoCols = null,
    variants = null;

  if (variantIdsToLoad.length > 0) {
    const { sections, codeInfoCols, variants, codeInfo } =
      useProjectState.getState();
    const res = await route_load_section_json_source({
      project: { sections, codeInfoCols, variants, codeInfo },
      variantIdsToLoad,
    });
    if (res200(res)) {
      ({ codeInfo, codeInfoCols, variants } = res.data.project);
    }
  }

  return { variants, codeInfo, codeInfoCols };
}

async function apiKeyUpdateHandler(updatedFileInfo: FileWatcherUpdateAPIKeys) {
  const { fileContent } = updatedFileInfo;
  useAIStore.setState({
    apiKeys: fileContent,
    apiKeysInitialLoadComplete: true,
  });
}

function genPythonCodeUpdateHandler(
  updatedFileInfo: FileWatcherUpdateGenPythonCode,
) {
  const { fileContent } = updatedFileInfo;
  useProjectState.setState((state) => {
    const sectionId = state.singletonSections[SectionTypeEnum.GenPythonCode];
    if (sectionId) {
      setEffectiveSectionImplValue<"GenPythonCodeSection">(state, sectionId, {
        code: fileContent,
      });
    }
  });
}
