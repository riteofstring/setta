import C from "constants/constants.json";
import { URLS } from "utils/constants";
import { get, post } from "./utils";

export async function dbGetLLMResponse(model, message, sessionId = null) {
  try {
    // Use fetch directly for streaming
    const response = await fetch(`${URLS.BACKEND}${C.ROUTE_GET_LLM_RESPONSE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        message,
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Return the response object for streaming
    return response;
  } catch (error) {
    console.error("Error in dbGetLLMResponse:", error);
    throw error;
  }
}

export async function dbGetApiKeys() {
  try {
    // Using the get utility function
    const response = await get({
      address: C.ROUTE_GET_API_KEYS,
    });

    return response.apiKeys || [];
  } catch (error) {
    console.error("Error in dbGetApiKeys:", error);
    throw error;
  }
}

export async function dbSetApiKeys(apiKeys) {
  try {
    const response = await post({
      body: {
        apiKeys,
      },
      address: C.ROUTE_SET_API_KEYS,
    });

    console.log("Response received from API Keys update:", response);
    return response;
  } catch (error) {
    console.error("Error in dbSetApiKeys:", error);
    throw error;
  }
}
