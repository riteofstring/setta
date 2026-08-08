import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  getFileBrowserRoot,
  getFolderContents,
  writeFileBrowserFileContent,
  type FilebrowserListFolderResponse as ListFolderResponse,
  type FilebrowserRootResponse as RootResponse,
  type FilebrowserWriteFileContentResponse as WriteFileContentResponse,
} from "openapi/http";
import { uploadBinaryPayload } from "utils/binaryUpload";
type NativeFileImportResult =
  | {
      status: "ok";
      filePath: string;
      fileName: string;
    }
  | {
      status: "failed";
      error: string;
    };
type NativeFileImportFailure = Extract<
  NativeFileImportResult,
  { status: "failed" }
>;
type GetFileBrowserRootRouteResponse = ResponseDataAndStatus<RootResponse>;
type GetFolderContentsRouteResponse = ResponseDataAndStatus<ListFolderResponse>;
type WriteFileBrowserFileContentRouteResponse =
  ResponseDataAndStatus<WriteFileContentResponse>;
type NativeFileImportTarget = {
  filePath: string;
  fileName: string;
};
type NativeFileImportContext = {
  rootPath: string;
  pathSeparator: string;
  safeName: string;
  existingNames: Set<string>;
  target: NativeFileImportTarget;
};
const MAX_UNIQUE_NAME_PROBES = 10000;
const MAX_WRITE_FILE_CONFLICT_RETRIES = 1000;
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
): NativeFileImportTarget {
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
function failNativeFileImport(error: string): NativeFileImportFailure {
  return {
    status: "failed",
    error,
  };
}
async function loadWorkspaceImportContext(
  fileName: string,
): Promise<NativeFileImportContext | NativeFileImportFailure> {
  const rootRes = (await callOpenAPI(
    getFileBrowserRoot(),
  )) as GetFileBrowserRootRouteResponse;
  if (!res200(rootRes)) {
    return failNativeFileImport(
      getErrorDetail(rootRes.data) ?? "Failed to resolve workspace root.",
    );
  }
  const safeName = sanitizeDroppedFileName(fileName);
  const existingNames = new Set<string>();
  const folderRes = (await callOpenAPI(
    getFolderContents({
      body: {
        folderPath: rootRes.data.rootPath,
        ignorePatterns: rootRes.data.ignorePatterns,
        includeHidden: true,
        includeMtime: false,
        includeSize: false,
        maxEntries: 5000,
        missingFolderBehavior: "error",
      },
    } as Parameters<typeof getFolderContents>[0]),
  )) as GetFolderContentsRouteResponse;
  if (res200(folderRes)) {
    for (const item of folderRes.data.items) {
      existingNames.add(item.name);
    }
  }
  return {
    rootPath: rootRes.data.rootPath,
    pathSeparator: rootRes.data.pathSeparator,
    safeName,
    existingNames,
    target: resolveUniqueWorkspacePath(
      rootRes.data.rootPath,
      rootRes.data.pathSeparator,
      existingNames,
      safeName,
    ),
  };
}
async function uploadNativeFileContent(
  file: File,
  safeName: string,
): Promise<{ contentId: string } | NativeFileImportFailure> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return failNativeFileImport("Failed to read dropped file data.");
  }
  const uploadResult = await uploadBinaryPayload({
    bytes,
    fileName: safeName,
    mimeType: file.type || null,
  });
  if (uploadResult.status === "failed") {
    return failNativeFileImport(uploadResult.error);
  }
  return {
    contentId: uploadResult.contentId,
  };
}
async function writeUploadedFileToWorkspace(
  context: NativeFileImportContext,
  contentId: string,
): Promise<NativeFileImportResult> {
  let target = context.target;
  for (
    let attempt = 0;
    attempt < MAX_WRITE_FILE_CONFLICT_RETRIES;
    attempt += 1
  ) {
    const writeRes = (await callOpenAPI(
      writeFileBrowserFileContent({
        body: {
          path: target.filePath,
          contentId,
          expectedMtimeNs: null,
        },
      } as Parameters<typeof writeFileBrowserFileContent>[0]),
    )) as WriteFileBrowserFileContentRouteResponse;
    if (res200(writeRes)) {
      return {
        status: "ok",
        filePath: writeRes.data.path,
        fileName: target.fileName,
      };
    }
    if (writeRes.status !== 409) {
      return failNativeFileImport(
        getErrorDetail(writeRes.data) ?? "Failed to import dropped file.",
      );
    }
    context.existingNames.add(target.fileName);
    target = resolveUniqueWorkspacePath(
      context.rootPath,
      context.pathSeparator,
      context.existingNames,
      context.safeName,
    );
  }
  return failNativeFileImport(
    "Failed to allocate a unique file path for the dropped file after repeated conflicts.",
  );
}
export async function importNativeFileToWorkspace(
  file: File,
): Promise<NativeFileImportResult> {
  const context = await loadWorkspaceImportContext(file.name);
  if ("status" in context) {
    return context;
  }
  const uploadResult = await uploadNativeFileContent(file, context.safeName);
  if ("status" in uploadResult) {
    return uploadResult;
  }
  return writeUploadedFileToWorkspace(context, uploadResult.contentId);
}
