import { restartLanguageServer as restartLanguageServerRequest } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useShareSession, useWaitingForLSPResult } from "state/definitions";
import {
  getErrorCode,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import { NotificationTypeEnum } from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";

function setWaitingForLSP({ category, id, delay = 200 }) {
  const timeoutId = setTimeout(() => {
    useWaitingForLSPResult.setState((x) => {
      x[category][id] = true;
    });
  }, delay); // Delay of 200 ms

  // returns function to set waiting to false
  return () => {
    clearTimeout(timeoutId);
    useWaitingForLSPResult.setState((x) => {
      x[category][id] = false;
    });
  };
}

export function setTextFieldWaitingForLSP({ sectionId, paramInfoId }) {
  const id = textFieldIdForLSPWaiting({ sectionId, paramInfoId });
  return setWaitingForLSP({ category: "textFields", id });
}

export function setParametersRequestWaitingForLSP(sectionId) {
  return setWaitingForLSP({
    category: "parametersRequest",
    id: sectionId,
    delay: 0,
  });
}

export function textFieldIdForLSPWaiting({ sectionId, paramInfoId }) {
  return `${sectionId}-${paramInfoId}`;
}

type RestartLanguageServerRouteResponse = ResponseDataAndStatus<unknown>;

export async function restartLanguageServer(): Promise<void> {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }

  const response = (await callOpenAPI(
    restartLanguageServerRequest(),
  )) as RestartLanguageServerRouteResponse;
  if (res200(response)) {
    addTemporaryNotification("Restarting Language Server");
    return;
  }

  const errorCode = getErrorCode(response.data);
  const errorDetail =
    getErrorDetail(response.data) ?? "Failed to restart language server.";
  if (errorCode === "language_server_not_configured") {
    addTemporaryNotification(errorDetail, NotificationTypeEnum.error);
    return;
  }
  addTemporaryNotification(
    "Failed to restart language server.",
    NotificationTypeEnum.error,
  );
}
