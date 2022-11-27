import { generateCode as generateCodeDb } from "dbRequests/codeGenerator";
import { thunk } from "easy-peasy";

export const generateCode = thunk(async (actions, payload, helpers) => {
  const { codeId, codeJson } = payload;
  const access_token = helpers.getStoreState().auth.access_token;
  return await generateCodeDb({ access_token, codeId, codeJson });
});
