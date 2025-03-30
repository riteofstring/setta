import C from "constants/constants.json";
import { post } from "./utils";

export async function dbGetLLMResponse(model, messages) {
  return await post({
    body: { model, messages },
    address: C.ROUTE_GET_LLM_RESPONSE,
  });
}
