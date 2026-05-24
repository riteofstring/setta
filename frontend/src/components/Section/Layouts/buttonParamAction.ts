import { sendRealtimeDependencyEvent } from "state/actions/websocketReceive";
import type {
  ButtonParamCodeObjImpl,
  LiteralDependencyValue,
} from "utils/generatedTypes";
import {
  ButtonActionModeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  HTTPRequestMethodEnum,
} from "utils/generatedTypes";
import { sendButtonSettaRequest } from "./settaApiAction";

export type ButtonRequestConfig = Pick<
  ButtonParamCodeObjImpl,
  | "actionMode"
  | "requestMethod"
  | "requestUrl"
  | "requestHeaderKey"
  | "requestHeaderValue"
  | "requestBody"
>;

export function buildButtonRequestConfig(
  buttonImpl: ButtonParamCodeObjImpl,
): ButtonRequestConfig {
  return {
    actionMode: buttonImpl.actionMode,
    requestMethod: buttonImpl.requestMethod,
    requestUrl: buttonImpl.requestUrl,
    requestHeaderKey: buttonImpl.requestHeaderKey,
    requestHeaderValue: buttonImpl.requestHeaderValue,
    requestBody: buttonImpl.requestBody,
  };
}

export function triggerButtonParamAction({
  buttonConfig,
  controlParamId,
  sectionId,
}: {
  readonly buttonConfig: ButtonRequestConfig;
  readonly controlParamId: string;
  readonly sectionId: string;
}) {
  if (buttonConfig.actionMode === ButtonActionModeEnum.HTTP_REQUEST) {
    sendButtonHttpRequest(buttonConfig);
    return;
  }
  if (buttonConfig.actionMode === ButtonActionModeEnum.SETTA_API) {
    sendButtonSettaRequest(buttonConfig);
    return;
  }
  const payload: LiteralDependencyValue = {
    payload: JSON.stringify({
      actionMode: buttonConfig.actionMode,
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

function sendButtonHttpRequest(config: ButtonRequestConfig) {
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
  void fetch(requestUrl, {
    method,
    headers,
    body,
  });
}
