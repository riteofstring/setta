import type { BackendClient, SteerEasyRunRequest } from "@generated/backend";
import { isBackendRequestError } from "@shared/backend-runtime";
import type { EasyRunSteerResult } from "@shared/easy-run-ipc";

export async function steerEasyRunForWeb(
  client: BackendClient,
  request: SteerEasyRunRequest,
): Promise<EasyRunSteerResult> {
  try {
    return {
      kind: "success",
      run: await client.steerEasyRun(request),
    };
  } catch (error) {
    if (!isBackendRequestError(error)) {
      throw error;
    }
    return {
      code: error.code,
      kind: "failure",
      message: error.message,
      operationApplied: error.operationApplied,
    };
  }
}
