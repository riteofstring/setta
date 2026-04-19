import { C_ADDRESSES } from "utils/c_addresses";
import {
  resolveEndpointOriginForMode,
  type ServerMode,
} from "utils/serverModeBoundaryPolicy";
import { buildBinaryDownloadRoute } from "utils/transportRouteConstants";
import { client } from "openapi/http/generated/client.gen";
import { getActiveAppSubsystemFrontendHostRuntime } from "./runtimeHost";
export {
  checkIfFileExists,
  deleteArtifacts,
  downloadBinary,
  getAppDefinition,
  getAppDeploymentCurrentSession,
  getAppDeploymentProjectConfig,
  getAppDeploymentState,
  getAttachmentDownloadUrl,
  getLatestProjectState,
  getPasswordParamValue,
  listAppDeployments,
  loadCachedImageArtifacts,
  loadProjectConfig,
  publishAppDeployment,
  runCode,
  setAppDefinition,
  setParamEnteredValue,
  updateArtifacts,
  uploadBinary,
  validateAppDefinition,
} from "openapi/http/generated/sdk.gen";
export type {
  GetAppDeploymentCurrentSessionResponses,
  GetAppDeploymentStateResponses,
  GetLatestProjectStateResponse,
  HttpapiDeploymentMetadataResponse,
  HttpapiServerModeResponse,
  HttpapiPublishAppDeploymentRequest,
  PluginsSettaJsonRenderAppGenBackendAppdefinitionAppDefinition,
} from "openapi/http/generated/types.gen";
export { callOpenAPI } from "openapi/http/result";
export {
  getErrorDetail,
  getErrorCode,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
export {
  type BaseChildlessCodeObjImplUnion,
  type BaseSectionImplUnion,
  DefaultAppPolicy,
  RunSnapshotModeUIConfig,
  createSettingsState,
  createSingleConfig,
  createPolicy,
  isBaseParamCodeObjImpl,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  type Policy,
  type BaseDependencyKeyUnion,
  type BaseDependencyValueUnion,
  type Core,
  type ContentRef,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  type DateParamCodeObjImpl,
  DropzoneModeEnum,
  type ImageArtifact,
  type LiteralDependencyValue,
  type ObjectValues,
  type RunSnapshotMode,
  type Variant,
  ArtifactTypeEnum,
  SectionTypeEnum,
  TextBlockFormatEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  type TimeParamCodeObjImpl,
} from "utils/generatedTypes";
export {
  createDefaultAppPolicy,
  resolveAppPolicy,
} from "utils/deploymentPolicies";
export {
  resolveMainRunRequest,
  resolveRunRequest,
} from "utils/runCapabilities";

function resolveTransportBaseUrl(serverMode: ServerMode, address: string): string {
  const endpointOrigin = resolveEndpointOriginForMode(address, serverMode);
  if (endpointOrigin === "backend-origin") {
    return C_ADDRESSES.BACKEND_ORIGIN;
  }
  if (endpointOrigin === "launcher") {
    return C_ADDRESSES.LAUNCHER;
  }
  return C_ADDRESSES.BACKEND;
}

function resolveOpenAPIBaseURL(): string {
  if (typeof location === "undefined") {
    return "http://localhost";
  }
  return C_ADDRESSES.BACKEND_ORIGIN;
}

async function rebuildBackendRequest(
  request: Request,
  resolvedURL: string,
): Promise<Request> {
  const rebuiltInit: RequestInit = {
    method: request.method,
    headers: new Headers(request.headers),
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  };

  if (
    request.body !== null &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    rebuiltInit.body = await request.clone().arrayBuffer();
  }

  return new Request(resolvedURL, rebuiltInit);
}

function buildShareSessionHeaders(): Record<string, string> {
  const frontendHost = getActiveAppSubsystemFrontendHostRuntime();
  const runtimeShareSessionId =
    frontendHost?.getRuntimeContext().shareSessionId ?? null;
  const deploymentShareSessionId =
    frontendHost?.getAppDeploymentSession()?.shareSessionId ?? null;
  const shareSessionId = runtimeShareSessionId ?? deploymentShareSessionId;
  if (!shareSessionId) {
    return {};
  }
  return { "X-Share-Session-Id": shareSessionId };
}

function buildBackendURL(address: string): string {
  const frontendHost = getActiveAppSubsystemFrontendHostRuntime();
  const serverMode = frontendHost?.getServerModeState().mode ?? null;
  return new URL(address, resolveTransportBaseUrl(serverMode, address)).toString();
}

async function fetchOpenAPIRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const requestURL = new URL(request.url);
  const resolvedURL = buildBackendURL(
    `${requestURL.pathname}${requestURL.search}`,
  );
  const nextRequest = await rebuildBackendRequest(request, resolvedURL);
  const shareHeaders = buildShareSessionHeaders();
  for (const [key, value] of Object.entries(shareHeaders)) {
    nextRequest.headers.set(key, value);
  }
  return await fetch(nextRequest);
}

client.setConfig({
  baseUrl: resolveOpenAPIBaseURL(),
  credentials: "include",
  responseStyle: "fields",
  fetch: fetchOpenAPIRequest,
});

export function buildBinaryDownloadUrl(
  contentId: string,
  shareSessionId: string | null,
  serverMode: ServerMode,
): string {
  const address = buildBinaryDownloadRoute(contentId);
  const url = new URL(address, resolveTransportBaseUrl(serverMode, address));
  if (shareSessionId) {
    url.searchParams.set("shareSessionId", shareSessionId);
  }
  return url.toString();
}
