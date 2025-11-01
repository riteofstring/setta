import { useListenerEvents } from "state/definitions";
import { ListenerFrontendEmitContent } from "utils/generatedTypes";

export function addListenerFrontendEvent(content: ListenerFrontendEmitContent) {
  const targetKey = content.target ?? "";
  useListenerEvents.setState((state) => {
    const queue = state.eventsByTarget[targetKey] ?? [];
    queue.push(content.payload);
    state.eventsByTarget[targetKey] = queue.slice(-100);
  });
}
