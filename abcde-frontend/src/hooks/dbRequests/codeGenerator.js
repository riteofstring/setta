import { generateCode } from "dbRequests/codeGenerator";
import { useStoreState } from "easy-peasy";

export function useCodeGenerator() {
  const access_token = useStoreState((x) => x.auth.access_token);

  return async (codeJson) => {
    return await generateCode({ access_token, codeJson });
  };
}
