import { ChevronsDown, ChevronsUp } from "lucide-react";

export function ActivityGroupExpandAllButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  const Icon = expanded ? ChevronsUp : ChevronsDown;
  const label = expanded ? "Collapse activity group" : "Expand all activity details";
  return (
    <button
      aria-label={label}
      className="grid h-full w-6 shrink-0 place-items-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      data-expanded={expanded ? "true" : "false"}
      data-testid="activity-group-expand-all"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
