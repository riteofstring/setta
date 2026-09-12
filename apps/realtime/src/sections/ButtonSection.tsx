import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  type WorkspaceSection,
} from "@setta/workspace";

import { useRealtime } from "../app/runtimeContext";
import { runtimeCanInvoke } from "../app/runtimeState";
import { readButtonSectionData } from "./sectionData";

const ACTIVE_INVOCATION_STATES = new Set(["queued", "running", "streaming"]);

export function ButtonSection({ section }: { section: WorkspaceSection }) {
  const { actions, project, runtime } = useRealtime();
  const data = readButtonSectionData(section.data);
  const bindingIds = project.bindings
    .filter((binding) => binding.trigger.sectionId === section.id)
    .map((binding) => binding.id);
  const busy = bindingIds.some((bindingId) => {
    const state = runtime.invocations[bindingId]?.state;
    return state !== undefined && ACTIVE_INVOCATION_STATES.has(state);
  });
  return (
    <button
      aria-busy={busy}
      className={`realtime-action ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`}
      disabled={!runtimeCanInvoke(runtime)}
      onClick={() => actions.emit(section.id, "press", null)}
      type="button"
    >
      {busy ? `${data.label}…` : data.label}
    </button>
  );
}
