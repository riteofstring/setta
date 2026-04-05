import { getNotificationIcon } from "components/Panes/Overview/NotificationsArea";
import { type CSSProperties, useEffect, useState } from "react";
import { DEFAULT_TEMP_TIMEOUT } from "state/actions/notifications";
import { useNotifications } from "state/definitions";
import { type Notification as AppNotification } from "utils/generatedTypes";

export function Notification() {
  // State to track the notification to display in the navbar
  const [displayNotification, setDisplayNotification] =
    useState<AppNotification | null>(null);

  // Get the most recent notification from the store
  const latestNotification = useNotifications((state) =>
    state.notifications.length > 0 ? state.notifications[0] : null,
  );

  // Display the latest notification unless it is already stale.
  useEffect(() => {
    if (!latestNotification) {
      return;
    }

    const timeoutDuration = DEFAULT_TEMP_TIMEOUT;
    const nowTime = new Date().getTime();
    const notificationTime = new Date(latestNotification.timestamp).getTime();
    if (nowTime - notificationTime > timeoutDuration) {
      return;
    }

    setDisplayNotification((previousNotification) => {
      if (
        previousNotification &&
        previousNotification.id === latestNotification.id &&
        previousNotification.message === latestNotification.message &&
        previousNotification.type === latestNotification.type &&
        previousNotification.timestamp === latestNotification.timestamp
      ) {
        return previousNotification;
      }

      return latestNotification;
    });
  }, [latestNotification]);

  useEffect(() => {
    if (!displayNotification) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDisplayNotification(null);
    }, DEFAULT_TEMP_TIMEOUT);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [displayNotification]);

  // If there's no notification to display, don't render anything
  if (!displayNotification) {
    return null;
  }

  const { message, type } = displayNotification;
  const notificationStyle: CSSProperties = {
    animationDuration: `${DEFAULT_TEMP_TIMEOUT}ms`,
  };

  return (
    <div
      key={displayNotification.id}
      style={notificationStyle}
      className="header-notification-fade absolute inset-y-0 left-0 right-0 z-20 flex w-full min-w-0 items-center gap-0.5 bg-white pr-8 dark:bg-setta-875"
    >
      {getNotificationIcon(type, "ml-2 h-3 w-3 md:ml-4")}
      <p className="ml-2 hidden min-w-0 flex-1 self-center truncate text-xs text-setta-500 dark:text-setta-100 md:block">
        {message}
      </p>
    </div>
  );
}
