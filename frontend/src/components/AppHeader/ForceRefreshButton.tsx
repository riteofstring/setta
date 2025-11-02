import { Button } from "components/Utils/atoms/buttons/Button";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useState } from "react";
import { RiRefreshLine } from "react-icons/ri";
import { triggerListenerForceRefresh } from "state/actions/listeners";

export function ForceRefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleClick = async () => {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await triggerListenerForceRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const classes =
    "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-200 dark:hover:bg-setta-800";

  return (
    <Button
      onClick={handleClick}
      disabled={isRefreshing}
      twClasses={classes}
      {...getFloatingBoxHandlers({
        content: "Send the latest project snapshot to Python listeners.",
      })}
    >
      <RiRefreshLine className="text-sm" />
      {isRefreshing ? "Refreshing..." : "Force Refresh"}
    </Button>
  );
}
