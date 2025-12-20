import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useState } from "react";
import { RiRefreshLine } from "react-icons/ri";
import { triggerListenerForceRefresh } from "state/actions/listeners";

export function ListenerForceRefreshButton() {
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
    <button
      onClick={handleClick}
      disabled={isRefreshing}
      className={`focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer ${classes}`}
      {...getFloatingBoxHandlers({
        content: "Send the latest project snapshot to Python listeners.",
      })}
    >
      <RiRefreshLine className="text-sm" />
      {isRefreshing ? "Refreshing..." : "Listener Force Refresh"}
    </button>
  );
}
