import _ from "lodash";
import { useTemporaryMiscState } from "state/stores/layoutInteractionStores";
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

async function requestBlobFromCanvas(sectionId) {
  const fn = (actualId) => setTemporaryMiscState(actualId, true);
  const id = blobRequestId(sectionId);
  const condition = () => true;
  return await callFnAndWait({ id, condition, fn });
}

function blobRequestId(sectionId) {
  return `${sectionId}-blob-request`;
}

export function listenForCanvasToBlobRequests(sectionId, fnCanvasToBlob) {
  const id = blobRequestId(sectionId);
  const unsub = useTemporaryMiscState.subscribe(
    (x) => x[id],
    (x) => {
      if (x === true) {
        Promise.resolve(fnCanvasToBlob()).then((blob) => {
          setTemporaryMiscState(id, blob);
        });
      }
    },
  );
  return unsub;
}
