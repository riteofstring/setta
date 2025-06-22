import { useAIStore, useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_load_section_json_source } from "utils/generatedEndpoints";
import {
  FileWatcherUpdateUnion,
  FileWatchGroupNameEnum,
} from "utils/generatedTypes";
import { getSectionVariant, updateProjectState } from "./sectionInfos";

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

function updateGenPythonCode(updatedFileInfo) {
  const { fileContent } = updatedFileInfo;
  useProjectState.setState((state) => {
    const id = state.singletonSections[UITypeNameEnum.GEN_PYTHON_CODE];
    if (id) {
      getSectionVariant(id, state).code = fileContent;
    }
  });
}
