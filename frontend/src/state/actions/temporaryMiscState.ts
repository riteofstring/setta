import { useTemporaryMiscState } from "state/definitions";

function setTemporaryMiscState(id, message) {
  useTemporaryMiscState.setState({ [id]: message });
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
