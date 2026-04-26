import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  getFolderContents,
  type FilebrowserFolderContentItem as FolderContentItem,
  type FilebrowserListFolderResponse as ListFolderResponse,
} from "openapi/http";
import {
  isAbsoluteBrowserPath,
  normalizeBrowserPath,
} from "utils/browserPaths";

type FolderPathCompletionOptions = {
  rootPath: string | null;
  pathSeparator?: string;
  ignorePatterns?: string[] | null;
  maxEntries?: number;
  allowOutsideWorkspaceRoot?: boolean;
};

const WINDOWS_DRIVE_ROOT_REGEX = /^[A-Za-z]:$/;
type GetFolderContentsRouteResponse = ResponseDataAndStatus<ListFolderResponse>;

type FolderCompletionRequest = {
  baseFolderPath: string | null;
  targetFolderPath: string;
  from: number;
  to: number;
  separator: string;
};

function resolveSeparator(text: string, fallback: string): string {
  const lastSlash = text.lastIndexOf("/");
  const lastBackslash = text.lastIndexOf("\\");
  if (lastSlash === -1 && lastBackslash === -1) {
    return fallback;
  }
  return lastSlash > lastBackslash ? "/" : "\\";
}
function splitPathInput(text: string, fallbackSeparator: string) {
  const lastSlash = text.lastIndexOf("/");
  const lastBackslash = text.lastIndexOf("\\");
  const lastSeparator = Math.max(lastSlash, lastBackslash);
  const separator = resolveSeparator(text, fallbackSeparator);
  if (lastSeparator < 0) {
    return {
      dirPart: "",
      from: 0,
      separator,
    };
  }
  return {
    dirPart: text.slice(0, lastSeparator),
    from: lastSeparator + 1,
    separator,
  };
}
function resolveAbsoluteCompletionFolder(absoluteCandidate: string) {
  const normalizedCandidate = normalizeBrowserPath(absoluteCandidate);
  if (WINDOWS_DRIVE_ROOT_REGEX.test(normalizedCandidate)) {
    return `${normalizedCandidate}/`;
  }
  return normalizedCandidate;
}

function resolveFolderCompletionRequest(
  context: Parameters<CompletionSource>[0],
  rootPath: string,
  fallbackSeparator: string,
): FolderCompletionRequest | null {
  const textBefore = context.state.doc.sliceString(0, context.pos);
  if (!context.explicit && textBefore.length === 0) {
    return null;
  }
  const { dirPart, from, separator } = splitPathInput(
    textBefore,
    fallbackSeparator,
  );
  const useAbsolutePath = isAbsoluteBrowserPath(textBefore);
  const targetFolderPath = useAbsolutePath
    ? resolveAbsoluteCompletionFolder(dirPart || separator)
    : dirPart;
  const baseFolderPath = useAbsolutePath ? null : rootPath;
  if (!targetFolderPath && !baseFolderPath) {
    return null;
  }
  return {
    baseFolderPath,
    targetFolderPath,
    from,
    to: context.pos,
    separator,
  };
}

function buildFolderCompletionResult(
  entries: FolderContentItem[],
  request: FolderCompletionRequest,
) {
  const options: Completion[] = entries
    .filter((entry) => entry.type === "folder")
    .map((entry) => ({
      label: entry.name,
      type: "folder",
      apply: `${entry.name}${request.separator}`,
    }));
  if (options.length === 0) {
    return null;
  }
  return {
    from: request.from,
    to: request.to,
    options,
    filter: true,
  };
}

function resolveFolderCompletionResult(
  entries: FolderContentItem[] | Promise<FolderContentItem[]>,
  request: FolderCompletionRequest,
) {
  if (Array.isArray(entries)) {
    return buildFolderCompletionResult(entries, request);
  }
  return entries.then((resolvedEntries) =>
    buildFolderCompletionResult(resolvedEntries, request),
  );
}

async function loadFolderEntries({
  folderPath,
  baseFolderPath,
  ignorePatterns,
  maxEntries,
  allowOutsideWorkspaceRoot,
}: {
  folderPath: string;
  baseFolderPath: string | null;
  ignorePatterns: string[] | null | undefined;
  maxEntries: number | undefined;
  allowOutsideWorkspaceRoot: boolean | undefined;
}): Promise<FolderContentItem[]> {
  const res = (await callOpenAPI(
    getFolderContents({
      body: {
        folderPath,
        baseFolderPath,
        ignorePatterns: ignorePatterns ?? null,
        maxEntries: maxEntries ?? null,
        allowOutsideWorkspaceRoot: allowOutsideWorkspaceRoot ?? false,
        missingFolderBehavior: "empty",
      },
    } as Parameters<typeof getFolderContents>[0]),
  )) as GetFolderContentsRouteResponse;
  if (!res200(res)) {
    return [];
  }
  return res.data.items;
}
export function createFolderPathCompletionSource(
  options: FolderPathCompletionOptions,
): CompletionSource | null {
  if (!options.rootPath) {
    return null;
  }
  const fallbackSeparator =
    options.pathSeparator ?? (options.rootPath.includes("\\") ? "\\" : "/");
  const cache = new Map<string, FolderContentItem[]>();
  const inflight = new Map<string, Promise<FolderContentItem[]>>();
  const getEntries = (folderPath: string, baseFolderPath: string | null) => {
    const requestKey = `${baseFolderPath ?? ""}::${folderPath}`;
    const cached = cache.get(requestKey);
    if (cached) {
      return cached;
    }
    const pending = inflight.get(requestKey);
    if (pending) {
      return pending;
    }
    const request = loadFolderEntries({
      folderPath,
      baseFolderPath,
      ignorePatterns: options.ignorePatterns,
      maxEntries: options.maxEntries,
      allowOutsideWorkspaceRoot: options.allowOutsideWorkspaceRoot,
    }).then((entries) => {
      inflight.delete(requestKey);
      cache.set(requestKey, entries);
      return entries;
    });
    inflight.set(requestKey, request);
    return request;
  };
  return (context) => {
    const request = resolveFolderCompletionRequest(
      context,
      options.rootPath,
      fallbackSeparator,
    );
    if (!request) {
      return null;
    }
    const entries = getEntries(
      request.targetFolderPath,
      request.baseFolderPath,
    );
    return resolveFolderCompletionResult(entries, request);
  };
}
export function createDynamicFolderPathCompletionSource(
  getOptions: () => FolderPathCompletionOptions,
): CompletionSource {
  const cache = new Map<string, FolderContentItem[]>();
  const inflight = new Map<string, Promise<FolderContentItem[]>>();
  let lastCacheKey: string | null = null;
  const getCacheKey = (options: FolderPathCompletionOptions) => {
    const ignoreKey = (options.ignorePatterns ?? []).join("\n");
    return `${options.rootPath ?? ""}||${options.pathSeparator ?? ""}||${ignoreKey}||${options.maxEntries ?? ""}||${options.allowOutsideWorkspaceRoot === true}`;
  };
  const getEntries = (
    options: FolderPathCompletionOptions,
    folderPath: string,
    baseFolderPath: string | null,
  ) => {
    const requestKey = `${baseFolderPath ?? ""}::${folderPath}`;
    const cached = cache.get(requestKey);
    if (cached) {
      return cached;
    }
    const pending = inflight.get(requestKey);
    if (pending) {
      return pending;
    }
    const request = loadFolderEntries({
      folderPath,
      baseFolderPath,
      ignorePatterns: options.ignorePatterns,
      maxEntries: options.maxEntries,
      allowOutsideWorkspaceRoot: options.allowOutsideWorkspaceRoot,
    }).then((entries) => {
      inflight.delete(requestKey);
      cache.set(requestKey, entries);
      return entries;
    });
    inflight.set(requestKey, request);
    return request;
  };
  return (context) => {
    const options = getOptions();
    if (!options.rootPath) {
      return null;
    }
    const cacheKey = getCacheKey(options);
    if (lastCacheKey !== cacheKey) {
      cache.clear();
      inflight.clear();
      lastCacheKey = cacheKey;
    }
    const fallbackSeparator =
      options.pathSeparator ?? (options.rootPath.includes("\\") ? "\\" : "/");
    const request = resolveFolderCompletionRequest(
      context,
      options.rootPath,
      fallbackSeparator,
    );
    if (!request) {
      return null;
    }
    const entries = getEntries(
      options,
      request.targetFolderPath,
      request.baseFolderPath,
    );
    return resolveFolderCompletionResult(entries, request);
  };
}
