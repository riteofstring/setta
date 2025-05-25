import { dbLoadSectionJSONSource } from "requests/jsonSource";
import { useAIStore, useProjectState } from "state/definitions";
import { C } from "utils/c";
import { getSectionVariant, updateSectionInfos } from "./sectionInfos";

export async function updateWithFileChanges(updatedFileInfo) {
  const { fileWatchGroupName } = updatedFileInfo;

  if (fileWatchGroupName === "jsonSource") {
    await updateJSONSourceContents(updatedFileInfo);
  } else if (fileWatchGroupName === "apiKeys") {
    updateApiKeyInfo(updatedFileInfo);
  } else if (fileWatchGroupName === "genPythonCode") {
    updateGenPythonCode(updatedFileInfo);
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
    updateSectionInfos({
      variants,
      codeInfo,
      codeInfoCols,
      state,
    });
  });
}

export async function loadJsonContents(variantIdsToLoad) {
  let codeInfo = null,
    codeInfoCols = null,
    variants = null;

  if (variantIdsToLoad.length > 0) {
    const res = await dbLoadSectionJSONSource(variantIdsToLoad);
    if (res.status === 200) {
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
    const id = state.singletonSections[C.GEN_PYTHON_CODE];
    if (id) {
      getSectionVariant(id, state).code = fileContent;
    }
  });
}
