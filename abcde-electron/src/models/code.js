import { action, thunk } from "easy-peasy";
import { getLatestCode as getLatestCodeBackend } from "../dbRequests/ui";
import {ipcRenderer} from "../utils/constants"

const auth = {
  code: null,
  codeToken: null,
  tokensAlreadyRun: {},

  setCodeToken: action((state, payload) => {
    state.codeToken = payload;
  }),

  setCode: action((state, payload) => {
    const { code, codeToken } = payload;
    if (state.codeToken === codeToken) {
      state.code = code;
      if (!(state.codeToken in state.tokensAlreadyRun)) {
        console.log("RUNNING PROGRAM")
        console.log("codeToken = ", state.codeToken)
        state.tokensAlreadyRun[state.codeToken] = true;
        ipcRenderer.send("asynchronous-message", {
          arg: "runProgram",
          data: state.code,
        });
      }
      state.codeToken = null;
    }
  }),

  runLatestCode: thunk(async (action, payload, helpers) => {
    const { token } = payload;
    const result = await getLatestCodeBackend({ token });
    if (result) {
      action.setCode(result);
    }
  }),
};

export default auth;
