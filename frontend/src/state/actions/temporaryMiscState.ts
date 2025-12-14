import _ from "lodash";
import { useTemporaryMiscState } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

function deleteTemporaryMiscState(id) {
  useTemporaryMiscState.setState((state) => _.omit(state, [id]), true);
}

function setTemporaryMiscState(id, message) {
  useTemporaryMiscState.setState({ [id]: message });
}

function callFnAndWait({ id, condition, fn }) {
  return new Promise((resolve) => {
    const actualId = id ? id : createNewId();
    const unsub = useTemporaryMiscState.subscribe(
      (x) => x[actualId],
      (x) => {
        if (!condition || condition(x)) {
          unsub();
          resolve(x);
          deleteTemporaryMiscState(actualId);
        }
      },
    );

    fn?.(actualId);
  });
}

async function requestBase64FromCanvas(sectionId) {
  const fn = (actualId) => setTemporaryMiscState(actualId, true);
  const id = base64RequestId(sectionId);
  const condition = () => true;
  return await callFnAndWait({ id, condition, fn });
}

function base64RequestId(sectionId) {
  return `${sectionId}-base64-request`;
}

export function listenForCanvasToBase64Requests(sectionId, fnCanvasToBase64) {
  const id = base64RequestId(sectionId);
  const unsub = useTemporaryMiscState.subscribe(
    (x) => x[id],
    (x) => {
      if (x === true) {
        setTemporaryMiscState(id, fnCanvasToBase64());
      }
    },
  );
  return unsub;
}
