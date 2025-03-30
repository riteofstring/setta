import C from "constants/constants.json";
import { post } from "./utils";

export async function dbGetLLMResponse(model, message, sessionId = null) {
  try {
    const response = await post({
      body: {
        model,
        message,
        session_id: sessionId,
      },
      address: C.ROUTE_GET_LLM_RESPONSE,
    });

    console.log("Response received from LLM API:", response);
    return response;
  } catch (error) {
    console.error("Error in dbGetLLMResponse:", error);
    throw error; // Re-throw to be handled by the caller
  }
}
