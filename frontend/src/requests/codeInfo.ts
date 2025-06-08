import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbDocstringToMarkdown(docstring) {
  return await post({
    body: { docstring },
    address: RouteEnum.DOCSTRING_TO_MARKDOWN,
  });
}
