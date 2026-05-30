import { sendRealtimeDependencyEvent } from "state/actions/websocketReceive";
import {
  ButtonActionModeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  HTTPRequestMethodEnum,
  type BaseDependencyValueUnion,
  type ButtonParamCodeObjImpl,
} from "utils/generatedTypes";
import { post } from "utils/requestTransport";
import { buildSettaApiPayload } from "utils/settaApiPresets";

export type ButtonParamActionConfig = Pick<
  ButtonParamCodeObjImpl,
  | "actionMode"
  | "requestMethod"
  | "requestUrl"
  | "requestHeaderKey"
  | "requestHeaderValue"
  | "requestBody"
>;

export function dispatchButtonParamAction({
  config,
  sectionId,
  controlParamId,
}: {
  config: ButtonParamActionConfig;
  sectionId: string;
  controlParamId: string;
}) {
  if (config.actionMode === ButtonActionModeEnum.HTTP_REQUEST) {
    sendButtonHttpRequest(config);
    return;
  }
  if (config.actionMode === ButtonActionModeEnum.SETTA_API) {
    sendButtonSettaRequest(config);
    return;
  }
  const payload: Extract<BaseDependencyValueUnion, { type: "Literal" }> = {
    payload: JSON.stringify({
      actionMode: config.actionMode,
      controlParamId,
    }),
    type: DependencyValueTypeEnum.Literal,
  };
  sendRealtimeDependencyEvent({
    dependencyKey: {
      type: DependencyKeyTypeEnum.Section,
      sectionId,
    },
    payload,
  });
}

export function sendButtonSettaRequest(
  config: Pick<ButtonParamActionConfig, "requestUrl" | "requestBody">,
): void {
  const route = config.requestUrl.trim();
  if (route === "") {
    return;
  }
  // Button-triggered Setta API calls intentionally allow custom user-entered
  // routes in addition to known presets, so this stays on the low-level post()
  // boundary instead of a fail-closed generated endpoint wrapper.
  const payload = buildSettaApiPayload(route, config.requestBody);
  void post(route, payload);
}

function sendButtonHttpRequest(config: ButtonParamActionConfig) {
  const requestUrl = config.requestUrl.trim();
  if (requestUrl === "") {
    return;
  }
  const method = config.requestMethod ?? HTTPRequestMethodEnum.POST;
  const headerKey = config.requestHeaderKey.trim();
  let headers: HeadersInit | undefined;
  if (headerKey !== "") {
    headers = { [headerKey]: config.requestHeaderValue };
  }
  const trimmedBody = config.requestBody.trim();
  let body: string | undefined;
  if (
    trimmedBody !== "" &&
    method !== HTTPRequestMethodEnum.GET &&
    method !== HTTPRequestMethodEnum.HEAD
  ) {
    body = config.requestBody;
  }
  const requestInit: RequestInit = {
    method,
  };
  if (headers) {
    requestInit.headers = headers;
  }
  if (body !== undefined) {
    requestInit.body = body;
  }
  void fetch(requestUrl, requestInit);
}
