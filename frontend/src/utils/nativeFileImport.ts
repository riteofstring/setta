import { uploadBinaryPayload } from "utils/binaryUpload";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
  route_write_file_browser_file_content,
} from "utils/generatedEndpoints";

type NativeFileImportResult =
  | { status: "ok"; filePath: string; fileName: string }
  | { status: "failed"; error: string };
const MAX_UNIQUE_NAME_PROBES = 10_000;
const MAX_WRITE_FILE_CONFLICT_RETRIES = 1_000;

function sanitizeDroppedFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutSeparators = trimmed.replace(/[\\/]+/g, "_");
  return withoutSeparators.length > 0 ? withoutSeparators : "dropped-file";
}

function splitFileNameExtension(fileName: string): {
  stem: string;
  extension: string;
} {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return { stem: fileName, extension: "" };
  }
  return {
    stem: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex),
  };
}

function joinPath(
  rootPath: string,
  pathSeparator: string,
  fileName: string,
): string {
  if (rootPath.endsWith(pathSeparator)) {
    return `${rootPath}${fileName}`;
  }
  return `${rootPath}${pathSeparator}${fileName}`;
}

function resolveUniqueWorkspacePath(
  rootPath: string,
  pathSeparator: string,
  existingNames: Set<string>,
  fileName: string,
): { filePath: string; fileName: string } {
  const { stem, extension } = splitFileNameExtension(fileName);
  for (let index = 0; index < MAX_UNIQUE_NAME_PROBES; index += 1) {
    const candidateName =
      index === 0 ? fileName : `${stem}-${index}${extension}`;
    if (!existingNames.has(candidateName)) {
      return {
        filePath: joinPath(rootPath, pathSeparator, candidateName),
        fileName: candidateName,
      };
    }
  }
  const fallbackName = `${stem}-${Date.now()}${extension}`;
  return {
    filePath: joinPath(rootPath, pathSeparator, fallbackName),
    fileName: fallbackName,
  };
}

export async function importNativeFileToWorkspace(
  file: File,
): Promise<NativeFileImportResult> {
  const rootRes = await route_get_file_browser_root();
  if (!res200(rootRes)) {
    return {
      status: "failed",
      error:
        getErrorDetail(rootRes.data) ?? "Failed to resolve workspace root.",
    };
  }
  const rootPath = rootRes.data.rootPath;
  const pathSeparator = rootRes.data.pathSeparator;
  const safeName = sanitizeDroppedFileName(file.name);
  const existingNames = new Set<string>();
  const folderRes = await route_get_folder_contents({
    folderPath: rootPath,
    ignorePatterns: rootRes.data.ignorePatterns,
    includeMtime: false,
    includeSize: false,
    maxEntries: 5000,
    missingFolderBehavior: "error",
  });
  if (res200(folderRes)) {
    for (const item of folderRes.data) {
      existingNames.add(item.name);
    }
  }

  let target = resolveUniqueWorkspacePath(
    rootPath,
    pathSeparator,
    existingNames,
    safeName,
  );
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return {
      status: "failed",
      error: "Failed to read dropped file data.",
    };
  }

  const uploadResult = await uploadBinaryPayload({
    bytes,
    fileName: safeName,
    mimeType: file.type || null,
  });
  if (uploadResult.status === "failed") {
    return {
      status: "failed",
      error: uploadResult.error,
    };
  }

  for (
    let attempt = 0;
    attempt < MAX_WRITE_FILE_CONFLICT_RETRIES;
    attempt += 1
  ) {
    const writeRes = await route_write_file_browser_file_content({
      path: target.filePath,
      contentId: uploadResult.contentId,
      expectedMtimeNs: null,
    });
    if (res200(writeRes)) {
      return {
        status: "ok",
        filePath: writeRes.data.path,
        fileName: target.fileName,
      };
    }
    if (writeRes.status === 409) {
      existingNames.add(target.fileName);
      target = resolveUniqueWorkspacePath(
        rootPath,
        pathSeparator,
        existingNames,
        safeName,
      );
      continue;
    }
    return {
      status: "failed",
      error: getErrorDetail(writeRes.data) ?? "Failed to import dropped file.",
    };
  }

  return {
    status: "failed",
    error:
      "Failed to allocate a unique file path for the dropped file after repeated conflicts.",
  };
}
