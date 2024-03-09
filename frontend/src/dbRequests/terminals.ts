import { post } from "./utils";

export async function dbGetFreeTerminal() {
  return await post({
    body: {},
    address: "/terminal/getFreeTerminal",
  });
}
