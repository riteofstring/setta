import { useAIStore, useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_load_section_json_source } from "utils/generatedEndpoints";
import {
  FileWatcherUpdateGenPythonCode,
  FileWatcherUpdateUnion,
  FileWatchGroupNameEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { getSectionImplLayering, updateProjectState } from "./sectionInfos";

export async function updateWithFileChanges(
  updatedFileInfo: FileWatcherUpdateUnion,
) {
  const { fileWatchGroupName } = updatedFileInfo;

  switch (fileWatchGroupName) {
    case FileWatchGroupNameEnum.jsonSource:
      return await updateJSONSourceContents(updatedFileInfo);
    case FileWatchGroupNameEnum.apiKeys:
      return updateApiKeyInfo(updatedFileInfo);
    case FileWatchGroupNameEnum.genPythonCode:
      return updateGenPythonCode(updatedFileInfo);
    default:
      return fileWatchGroupName satisfies never;
  }
}

// TODO: this logic should be on the backend
async function updateJSONSourceContents(updatedFileInfo) {
  const { absPath, relPath, destAbsPath, destRelPath, matchingGlobPatterns } =
    updatedFileInfo;

  const variantIdsToLoad = [];
  for (const [id, v] of Object.entries(useProjectState.getState().variants)) {
    if (!v.isJsonSource) {
      continue;
    }

    if (
      !(absPath && v.name === absPath) &&
      !(relPath && v.name === relPath) &&
      !(destAbsPath && v.name === destAbsPath) &&
      !(destRelPath && v.name === destRelPath)
    ) {
      continue;
    }
    variantIdsToLoad.push(id);
  }

  const { variants, codeInfo, codeInfoCols } =
    await loadJsonContents(variantIdsToLoad);

  useProjectState.setState((state) => {
    updateProjectState({
      variants,
      codeInfo,
      codeInfoCols,
      state,
    });
  });
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

async function updateApiKeyInfo(updatedFileInfo) {
  const { fileContent } = updatedFileInfo;
  useAIStore.setState({
    apiKeys: fileContent,
    apiKeysInitialLoadComplete: true,
  });
}

function updateGenPythonCode(updatedFileInfo: FileWatcherUpdateGenPythonCode) {
  const { fileContent } = updatedFileInfo;
  useProjectState.setState((state) => {
    const sectionId = state.singletonSections[SectionTypeEnum.GenPythonCode];
    if (sectionId) {
      const implLayering = getSectionImplLayering(state, sectionId);
      if (implLayering.modifier.type === SectionTypeEnum.GenPythonCode) {
        implLayering.modifier.code = fileContent;
      }
    }
  });
}
