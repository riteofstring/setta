import _ from "lodash";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { useInteractiveDependencies } from "state/definitions";

export function useSendToInteractiveTasks(sourceInfo, throttleAmount = 0) {
  const isListenedTo = useInteractiveDependencies(
    (x) =>
      x.dependencies.has("null") ||
      x.dependencies.has(JSON.stringify(sourceInfo)),
  );

  const fn = (value, valueCallback) => {
    if (isListenedTo) {
      console.log("sending", value, valueCallback);
      sendToInteractiveTasks(sourceInfo, value, valueCallback);
    }
  };

  if (throttleAmount) {
    return _.throttle(fn, throttleAmount, { leading: false });
  }
  return fn;
}
