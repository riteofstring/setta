import C from "constants/constants.json";
import { post } from "./utils";

export async function dbGetLLMResponse(model, message, sessionId = null) {
  console.log("POST: ", {
    body: {
      model,
      message,
      session_id: sessionId,
    },
    address: C.ROUTE_GET_LLM_RESPONSE,
  });
  return await post({
    body: {
      model,
      message,
      session_id: sessionId,
    },
    address: C.ROUTE_GET_LLM_RESPONSE,
  });
}
