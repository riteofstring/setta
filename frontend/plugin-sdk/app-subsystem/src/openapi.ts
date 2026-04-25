import { C_ADDRESSES } from "./c_addresses";
import {
  resolveEndpointOriginForMode,
  type ServerMode,
} from "./serverModeBoundaryPolicy";
import { buildBinaryDownloadRoute } from "./transportRouteConstants";
import { rebuildBackendRequest } from "./openapi/http/requestRebuild";
import { client } from "./openapi/http/generated/client.gen";
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
} from "./openapi/http/generated/sdk.gen";
export type {
  AppsubsystemAppdefinitionAppDefinition,
  GetAppDeploymentCurrentSessionResponses,
  GetAppDeploymentStateResponses,
  GetLatestProjectStateResponse,
  HttpapiDeploymentMetadataResponse,
  HttpapiServerModeResponse,
  HttpapiPublishAppDeploymentRequest,
} from "./openapi/http/generated/types.gen";
export { callOpenAPI } from "./openapi/http/result";
export {
  getErrorDetail,
  getErrorCode,
  res200,
  type ResponseDataAndStatus,
} from "./endpointUtils";
export {
  type BaseChildlessCodeObjImplUnion,
  type BaseSectionImplUnion,
  DefaultAppPolicy,
  RunSnapshotModeUIConfig,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createContentRef,
  createCore,
  createImageArtifact,
  createProjectConfig,
  createSettingsState,
  createSingleConfig,
  createPolicy,
  createSectionCapabilities,
  createSingletonSections,
  createTextBlockSectionImpl,
  createVariant,
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
} from "./generatedTypes";
export {
  createDefaultAppPolicy,
  resolveAppPolicy,
} from "./deploymentPolicies";
export {
  resolveMainRunRequest,
  resolveRunRequest,
} from "./runCapabilities";

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

export function configureAppSubsystemOpenAPI(): void {
  client.setConfig({
    baseUrl: resolveOpenAPIBaseURL(),
    credentials: "include",
    responseStyle: "fields",
    fetch: fetchOpenAPIRequest,
  });
}

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
