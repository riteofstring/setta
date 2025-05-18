import C from "constants/constants.json";
import { useProjectState } from "state/definitions";
import { post } from "./utils";

export async function dbLoadSectionJSONSource(variantIdsToLoad) {
  return await post({
    body: {
      project: dataForRequest(),
      variantIdsToLoad,
    },
    address: C.ROUTE_LOAD_SECTION_JSON_SOURCE,
  });
}

export async function dbSaveSectionJSONSource(variantId) {
  return await post({
    body: {
      project: dataForRequest(),
      variantId,
    },
    address: C.ROUTE_SAVE_SECTION_JSON_SOURCE,
  });
}

function dataForRequest() {
  const {
    sections,
    codeInfoCols,
    variants: sectionVariants,
    codeInfo,
  } = useProjectState.getState();
  return { sections, codeInfo, codeInfoCols, sectionVariants };
}

export async function dbGetJSONSourcePathToBeDeleted(variantName) {
  return await post({
    body: {
      variantName,
    },
    address: C.ROUTE_GET_JSON_SOURCE_PATH_TO_BE_DELETED,
  });
}

export async function dbCreateFile(filepath) {
  return await post({
    body: {
      filepath,
    },
    address: C.ROUTE_CREATE_FILE,
  });
}

export async function dbDeleteFile(filepath) {
  return await post({
    body: {
      filepath,
    },
    address: C.ROUTE_DELETE_FILE,
  });
}

async function dbFileWatch(filepaths, fileWatchGroupName) {
  return await post({
    body: {
      filepaths,
      fileWatchGroupName,
    },
    address: C.ROUTE_FILE_WATCH_LIST,
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
    address: C.ROUTE_FILE_WATCH_GEN_PYTHON_CODE,
  });
}
