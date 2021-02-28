import React from "react";
import { useStoreState, useStoreActions } from "easy-peasy";

import { ipcRenderer } from "../../utils/constants";

const InfoPage = () => {
  const authToken = useStoreState((state) => state.auth.token);
  const code = useStoreState((state) => state.code.code);
  const codeToken = useStoreState((state) => state.code.codeToken);
  const runLatestCode = useStoreActions(
    (actions) => actions.code.runLatestCode
  );
  const setCodeToken = useStoreActions((actions) => actions.code.setCodeToken);

  console.log("InfoPage update");

  ipcRenderer.on("newCodeToken", (event, arg) => {
    if (arg) {
      ipcRenderer.send("asynchronous-message", {
        arg: "getCodeToken",
        data: null,
      });
    }
  });

  ipcRenderer.on("asynchronous-reply", (event, arg) => {
    // uuid4 has length 32
    if (arg.length === 36 && code !== arg) {
      setCodeToken(arg);
      ipcRenderer.send("asynchronous-message", {
        arg: "deleteCodeToken",
        data: null,
      });
    }
  });

  if (codeToken) {
    runLatestCode({ token: authToken });
  }
  else{
    ipcRenderer.send("asynchronous-message", {
      arg: "getRequestType",
      data: null,
    });
  }

  return <>{code}</>;
};

export default React.memo(InfoPage);
