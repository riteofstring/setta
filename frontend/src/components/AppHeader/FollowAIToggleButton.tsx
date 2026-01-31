import { RiFocus2Line } from "react-icons/ri";
import { useAIFollow } from "state/definitions";

export function FollowAIToggleButton() {
  const enabled = useAIFollow((state) => state.enabled);
  const stateClasses = enabled
    ? "text-blue-600 hover:text-blue-500 dark:text-blue-400"
    : "text-setta-700 hover:text-setta-900 dark:text-setta-100";

  return (
    <button
      aria-pressed={enabled}
      className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-2 text-xs font-semibold transition-colors focus-visible:ring-2 active:!bg-blue-100 dark:hover:bg-setta-800 active:dark:!bg-blue-950 ${stateClasses}`}
      onClick={() => {
        useAIFollow.setState((state) => {
          state.enabled = !state.enabled;
        });
      }}
    >
      <RiFocus2Line />
      Follow AI
    </button>
  );
}
