import { C } from "utils/c";
import { post } from "./utils";

export async function dbGetLLMResponse(projectConfigId, model, message, deepThink, chatId) {
  try {
    const response = await post({
      body: { projectConfigId, model, message, deepThink, chatId },
      address: C.ROUTE_GET_LLM_RESPONSE,
    });
    return response;
  } catch (error) {
    console.error("Error in dbGetLLMResponse:", error);
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

    return response;
  } catch (error) {
    console.error("Error in dbSetLLMApiKeys:", error);
    throw error;
  }
}

export async function dbGetAllLLMChatMetadata() {
  return await post({
    body: {},
    address: C.ROUTE_GET_ALL_LLM_CHAT_METADATA,
  });
}

export async function dbDeleteLLMChat(chatId) {
  return await post({
    body: { chatId },
    address: C.ROUTE_DELETE_LLM_CHAT,
  });
}

export async function dbStopLLMChat(chatId) {
  return await post({
    body: { chatId },
    address: C.ROUTE_STOP_LLM_CHAT,
  });
}

export async function dbGetLLMChat(chatId, projectConfigId) {
  return await post({
    body: { chatId, projectConfigId },
    address: C.ROUTE_GET_LLM_CHAT,
  });
}

export async function dbGetUUIDMappingForLLM() {
  return await post({
    body: {},
    address: C.ROUTE_GET_UUID_MAPPING_FOR_LLM,
  });
}
