import C from "constants/constants.json";
import { post } from "./utils";

export async function dbGetLLMResponse(
  model,
  message,
  deepThink,
  sessionId = null,
) {
  try {
    const response = await post({
      body: {
        model,
        message,
        deepThink,
        session_id: sessionId,
      },
      address: C.ROUTE_GET_LLM_RESPONSE,
    });

    console.log("Response received from LLM query:", response);
    return response;
  } catch (error) {
    console.error("Error in dbGetLLMResponse:", error);
    throw error;
  }
}

export async function dbGetLLMApiKeys(apiKeysFilepath) {
  try {
    const response = await post({
      body: {
        apiKeysFilepath,
      },
      address: C.ROUTE_GET_LLM_API_KEYS,
    });

    console.log("Response received from API Keys update:", response);
    return response;
  } catch (error) {
    console.error("Error in dbGetLLMApiKeys:", error);
    throw error;
  }
}

export async function dbSetLLMApiKeys(apiKeys, apiKeysFilepath) {
  try {
    const response = await post({
      body: {
        apiKeys,
        apiKeysFilepath,
      },
      address: C.ROUTE_SET_LLM_API_KEYS,
    });

    console.log("Response received from API Keys update:", response);
    return response;
  } catch (error) {
    console.error("Error in dbSetLLMApiKeys:", error);
    throw error;
  }
}
