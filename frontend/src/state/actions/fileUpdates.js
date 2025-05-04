import C from "constants/constants.json";
import { dbGetLLMApiKeys } from "requests/ai";
import { dbLoadSectionJSONSource } from "requests/jsonSource";
import { dbReadGenPythonCode } from "requests/lsp";
import { useAIStore, useSectionInfos } from "state/definitions";
import { updateSectionInfos } from "./sectionInfos";

export async function updateWithFileChanges(updatedFileInfo) {
  const { metadata } = updatedFileInfo;

  if (metadata === "jsonSource") {
    await updateJSONSourceContents(updatedFileInfo);
  } else if (metadata === "apiKeysFile") {
    await updateApiKeyInfo(updatedFileInfo);
  } else if (metadata === "genPythonCode") {
    await updateGenPythonCode(updateApiKeyInfo);
  }
}

async function updateJSONSourceContents(updatedFileInfo) {
  const { absPath, relPath, destAbsPath, destRelPath, matchingGlobPatterns } =
    updatedFileInfo;

  const variantIdsToLoad = [];
  for (const [id, v] of Object.entries(useSectionInfos.getState().variants)) {
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

  const { sectionVariants, codeInfo, codeInfoCols } =
    await loadJsonContents(variantIdsToLoad);

  useSectionInfos.setState((state) => {
    updateSectionInfos({
      sectionVariants,
      codeInfo,
      codeInfoCols,
      state,
    });
  });
}

export async function loadJsonContents(variantIdsToLoad) {
  let codeInfo = null,
    codeInfoCols = null,
    sectionVariants = null;

  if (variantIdsToLoad.length > 0) {
    const res = await dbLoadSectionJSONSource(variantIdsToLoad);
    if (res.status === 200) {
      ({ codeInfo, codeInfoCols, sectionVariants } = res.data.project);
    }
  }

  return { sectionVariants, codeInfo, codeInfoCols };
}

async function updateApiKeyInfo(updatedFileInfo) {
  const { absPath, destAbsPath } = updatedFileInfo;
  await updateLLMApiKeyInfo(destAbsPath ?? absPath);
}

export async function updateLLMApiKeyInfo(apiKeysFilepath) {
  const res = await dbGetLLMApiKeys(apiKeysFilepath);
  if (res.status == 200) {
    useAIStore.setState({
      apiKeys: res.data,
      apiKeysInitialLoadComplete: true,
    });
  }
}

export async function updateGenPythonCode(updatedFileInfo) {
  const { absPath, destAbsPath } = updatedFileInfo;
  const res = await dbReadGenPythonCode(destAbsPath ?? absPath);
  if (res.status === 200) {
    useSectionInfos.setState((state) => {
      const id = state.singletonSections[C.GEN_PYTHON_CODE];
      if (id) {
        state.x[id].code = res.data;
      }
    });
  }
}
