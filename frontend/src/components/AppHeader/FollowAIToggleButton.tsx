import { RiFocus2Line } from "react-icons/ri";
import { useAIFollow } from "state/definitions";

export function FollowAIToggleButton() {
  const enabled = useAIFollow((state) => state.enabled);
  const stateClasses = enabled
    ? "text-blue-600 hover:text-blue-500 dark:hover:text-blue-500"
    : "text-setta-600 hover:text-setta-900 dark:text-setta-300 dark:hover:text-white";

  return (
    <button
      aria-pressed={enabled}
      className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold transition-colors focus-visible:ring-2 active:!bg-transparent active:text-setta-500 dark:hover:bg-transparent active:dark:text-setta-300 ${stateClasses}`}
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
