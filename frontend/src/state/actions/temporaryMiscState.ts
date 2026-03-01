import _ from "lodash";
import { useTemporaryMiscState } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

type TemporaryMiscStatePatch = Record<string, unknown>;

const TIMEOUT_FLUSH_FRAME_ID = -1;

let queuedTemporaryMiscStatePatch: TemporaryMiscStatePatch = {};
let queuedTemporaryMiscStateFrameId: number | null = null;

function flushQueuedTemporaryMiscStateUpdates() {
  const pendingPatch = queuedTemporaryMiscStatePatch;
  queuedTemporaryMiscStatePatch = {};

  if (Object.keys(pendingPatch).length === 0) {
    return;
  }

  const currentState = useTemporaryMiscState.getState() as Record<
    string,
    unknown
  >;
  const nextPatch: TemporaryMiscStatePatch = {};
  let hasChanges = false;

  for (const [key, value] of Object.entries(pendingPatch)) {
    if (Object.is(currentState[key], value)) {
      continue;
    }
    nextPatch[key] = value;
    hasChanges = true;
  }

  if (!hasChanges) {
    return;
  }

  useTemporaryMiscState.setState(nextPatch);
}

function scheduleQueuedTemporaryMiscStateFlush() {
  if (queuedTemporaryMiscStateFrameId !== null) {
    return;
  }

  if (typeof globalThis.requestAnimationFrame === "function") {
    queuedTemporaryMiscStateFrameId = globalThis.requestAnimationFrame(() => {
      queuedTemporaryMiscStateFrameId = null;
      flushQueuedTemporaryMiscStateUpdates();
    });
    return;
  }

  queuedTemporaryMiscStateFrameId = TIMEOUT_FLUSH_FRAME_ID;
  setTimeout(() => {
    if (queuedTemporaryMiscStateFrameId !== TIMEOUT_FLUSH_FRAME_ID) {
      return;
    }
    queuedTemporaryMiscStateFrameId = null;
    flushQueuedTemporaryMiscStateUpdates();
  }, 0);
}

export function queueTemporaryMiscStateUpdate(
  partialState: TemporaryMiscStatePatch,
) {
  for (const [key, value] of Object.entries(partialState)) {
    queuedTemporaryMiscStatePatch[key] = value;
  }
  scheduleQueuedTemporaryMiscStateFlush();
}

export function flushQueuedTemporaryMiscStateUpdatesForTests() {
  if (
    queuedTemporaryMiscStateFrameId !== null &&
    queuedTemporaryMiscStateFrameId !== TIMEOUT_FLUSH_FRAME_ID &&
    typeof globalThis.cancelAnimationFrame === "function"
  ) {
    globalThis.cancelAnimationFrame(queuedTemporaryMiscStateFrameId);
  }
  queuedTemporaryMiscStateFrameId = null;
  flushQueuedTemporaryMiscStateUpdates();
}

export function resetQueuedTemporaryMiscStateUpdatesForTests() {
  if (
    queuedTemporaryMiscStateFrameId !== null &&
    queuedTemporaryMiscStateFrameId !== TIMEOUT_FLUSH_FRAME_ID &&
    typeof globalThis.cancelAnimationFrame === "function"
  ) {
    globalThis.cancelAnimationFrame(queuedTemporaryMiscStateFrameId);
  }
  queuedTemporaryMiscStateFrameId = null;
  queuedTemporaryMiscStatePatch = {};
}

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
