import { C_ADDRESSES } from "./c_addresses";
import { client } from "./openapi/http/generated/client.gen";
import { rebuildBackendRequest } from "./openapi/http/requestRebuild";
import { getActiveAppSubsystemFrontendHostRuntime } from "./runtimeHost";
import {
  resolveEndpointOriginForMode,
  type ServerMode,
} from "./serverModeBoundaryPolicy";
import { buildBinaryDownloadRoute } from "./transportRouteConstants";
export { createDefaultAppPolicy, resolveAppPolicy } from "./deploymentPolicies";
export {
  getErrorCode,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "./endpointUtils";
export {
  ArtifactTypeEnum,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createContentRef,
  createCore,
  createImageArtifact,
  createPolicy,
  createProjectConfig,
  createSectionCapabilities,
  createSettingsState,
  createSingleConfig,
  createSingletonSections,
  createTextBlockSectionImpl,
  createVariant,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DefaultAppPolicy,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  DropzoneModeEnum,
  isBaseChildlessCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  RunSnapshotModeUIConfig,
  SectionTypeEnum,
  TextBlockFormatEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  type BaseChildlessCodeObjImplUnion,
  type BaseDependencyKeyUnion,
  type BaseDependencyValueUnion,
  type BaseSectionImplUnion,
  type ContentRef,
  type Core,
  type DateParamCodeObjImpl,
  type ImageArtifact,
  type LiteralDependencyValue,
  type ObjectValues,
  type Policy,
  type RunSnapshotMode,
  type TimeParamCodeObjImpl,
  type Variant,
} from "./generatedTypes";
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
  AppsubsystemAppdeploymenthttpPublishAppDeploymentRequest as HttpapiPublishAppDeploymentRequest,
  HttpapiServerModeResponse,
} from "./openapi/http/generated/types.gen";
export { callOpenAPI } from "./openapi/http/result";
export { resolveMainRunRequest, resolveRunRequest } from "./runCapabilities";

function resolveTransportBaseUrl(
  serverMode: ServerMode,
  address: string,
): string {
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
  return new URL(
    address,
    resolveTransportBaseUrl(serverMode, address),
  ).toString();
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
