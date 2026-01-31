import { TbLink, TbLinkOff } from "react-icons/tb";
import { useAgenticLinkState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";

export function AgenticLinkButton({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  const sourceSectionId = useAgenticLinkState((state) => state.sourceSectionId);
  const isActive = sourceSectionId === sectionId;
  const isDisabled = !canEditStructure;

  const baseClassName =
    "nodrag ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border text-[12px] shadow-sm transition focus-visible:ring-2";
  const activeClassName =
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-200";
  const inactiveClassName =
    "border-slate-200 bg-white/80 text-slate-600 hover:bg-slate-50 dark:border-slate-600/40 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800/90";

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`${baseClassName} ${
        isActive ? activeClassName : inactiveClassName
      } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
      title={isActive ? "Cancel agent link mode" : "Create agentic link"}
      aria-pressed={isActive}
      onClick={() => {
        if (isDisabled) {
          return;
        }
        useAgenticLinkState.setState({
          sourceSectionId: isActive ? null : sectionId,
        });
      }}
    >
      {isActive ? <TbLinkOff /> : <TbLink />}
    </button>
  );
}
