import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_check_if_file_exists,
  route_create_file,
  route_get_file_browser_root,
  route_write_file_browser_file_content,
} from "utils/generatedEndpoints";

type NativeFileImportResult =
  | { status: "ok"; filePath: string; fileName: string }
  | { status: "failed"; error: string };

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

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

async function resolveUniqueWorkspacePath(
  rootPath: string,
  pathSeparator: string,
  fileName: string,
): Promise<string> {
  const { stem, extension } = splitFileNameExtension(fileName);
  for (let index = 0; index < 500; index += 1) {
    const candidateName =
      index === 0 ? fileName : `${stem}-${index}${extension}`;
    const candidatePath = joinPath(rootPath, pathSeparator, candidateName);
    const existsRes = await route_check_if_file_exists({
      filepath: candidatePath,
    });
    if (!res200(existsRes)) {
      return candidatePath;
    }
    if (!existsRes.data) {
      return candidatePath;
    }
  }
  return joinPath(rootPath, pathSeparator, `${stem}-${Date.now()}${extension}`);
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
  const targetPath = await resolveUniqueWorkspacePath(
    rootPath,
    pathSeparator,
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

  const createRes = await route_create_file({ filepath: targetPath });
  if (!res200(createRes)) {
    return {
      status: "failed",
      error:
        getErrorDetail(createRes.data) ??
        "Failed to create the workspace file for the dropped content.",
    };
  }

  const writeRes = await route_write_file_browser_file_content({
    path: targetPath,
    contentBase64: encodeBytesToBase64(bytes),
    expectedMtimeNs: null,
  });
  if (!res200(writeRes)) {
    return {
      status: "failed",
      error: getErrorDetail(writeRes.data) ?? "Failed to import dropped file.",
    };
  }
  return {
    status: "ok",
    filePath: writeRes.data.path,
    fileName: safeName,
  };
}
