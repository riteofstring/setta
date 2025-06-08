import { useProjectState } from "state/definitions";
import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbLoadSectionJSONSource(variantIdsToLoad) {
  return await post({
    body: {
      project: dataForRequest(),
      variantIdsToLoad,
    },
    address: RouteEnum.LOAD_SECTION_JSON_SOURCE,
  });
}

export async function dbSaveSectionJSONSource(variantId) {
  return await post({
    body: {
      project: dataForRequest(),
      variantId,
    },
    address: RouteEnum.SAVE_SECTION_JSON_SOURCE,
  });
}

function dataForRequest() {
  const { sections, codeInfoCols, variants, codeInfo } =
    useProjectState.getState();
  return { sections, codeInfo, codeInfoCols, variants };
}

export async function dbGetJSONSourcePathToBeDeleted(variantName) {
  return await post({
    body: {
      variantName,
    },
    address: RouteEnum.GET_JSON_SOURCE_PATH_TO_BE_DELETED,
  });
}

export async function dbCreateFile(filepath) {
  return await post({
    body: {
      filepath,
    },
    address: RouteEnum.CREATE_FILE,
  });
}

export async function dbDeleteFile(filepath) {
  return await post({
    body: {
      filepath,
    },
    address: RouteEnum.DELETE_FILE,
  });
}

async function dbFileWatch(filepaths, fileWatchGroupName) {
  return await post({
    body: {
      filepaths,
      fileWatchGroupName,
    },
    address: RouteEnum.FILE_WATCH_LIST,
  });
}

export async function dbFileWatchJsonSource(filepaths) {
  return await dbFileWatch(filepaths, "jsonSource");
}

export async function dbFileWatchApiKeys(filepaths) {
  return await dbFileWatch(filepaths, "apiKeys");
}

export async function dbFileWatchGenPythonCode({ watch, projectConfigId }) {
  return await post({
    body: {
      watch,
      projectConfigId,
    },
    address: RouteEnum.FILE_WATCH_GEN_PYTHON_CODE,
  });
}
