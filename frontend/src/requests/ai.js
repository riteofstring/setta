import C from "constants/constants.json";
import { post } from "./utils";

export async function dbGetLLMResponse(messages) {
  return await post({
    body: { messages },
    address: C.ROUTE_GET_LLM_RESPONSE,
  });
}
