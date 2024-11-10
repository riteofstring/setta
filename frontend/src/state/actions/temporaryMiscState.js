import { sendMessage } from "requests/websocket";
import { useTemporaryMiscState } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

export function setTemporaryMiscMessage(id, message) {
  useTemporaryMiscState.setState((x) => {
    x[id].message = message;
  });
}

export function decrementNumWaitingForTemporaryMiscMessage(id) {
  useTemporaryMiscState.setState((x) => {
    console.log("decrementNumWaitingForTemporaryMiscMessage", id);
    x[id].numWaiting -= 1;
    if (x[id].numWaiting === 0) {
      console.log("numWaiting === 0");
      delete x[id];
    }
  });
}

export function initTemporaryMiscMessage(id) {
  useTemporaryMiscState.setState((x) => {
    console.log("initTemporaryMiscMessage", id);
    if (!(id in x)) {
      x[id] = { message: null, numWaiting: 1 };
    } else {
      x[id].numWaiting += 1;
    }
  });
}

function callFnAndWait({ id, condition, fn }) {
  return new Promise((resolve) => {
    const actualId = id ? id : createNewId();
    initTemporaryMiscMessage(actualId);
    const unsub = useTemporaryMiscState.subscribe(
      (x) => x[actualId].message,
      (x) => {
        // console.log(
        //   "useTemporaryMiscState.getState().x",
        //   useTemporaryMiscState.getState(),
        // );
        if (!condition || condition(x)) {
          unsub();
          resolve(x);
          decrementNumWaitingForTemporaryMiscMessage(id);
        }
      },
    );

    fn(actualId);
  });
}

export async function sendMessageAndWait({
  id,
  messageType,
  content,
  condition,
}) {
  const fn = (actualId) =>
    sendMessage({
      id: actualId,
      messageType,
      content,
    });
  return await callFnAndWait({ id, condition, fn });
}

export async function requestBase64FromDrawArea(sectionId) {
  const fn = (actualId) => setTemporaryMiscMessage(actualId, true);
  const id = base64RequestId(sectionId);
  const condition = (x) => "completeCanvas" in x;
  return await callFnAndWait({ id, condition, fn });
}

export function base64RequestId(sectionId) {
  return `${sectionId}-base64-request`;
}
