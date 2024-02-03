import { post } from "./utils";

export async function dbGetBaseUITypes() {
  return await post({
    body: {},
    address: "/uiTypes/getBaseUITypes",
  });
}
