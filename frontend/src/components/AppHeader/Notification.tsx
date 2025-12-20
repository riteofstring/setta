import { getNotificationIcon } from "components/Panes/Overview/NotificationsArea";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_TEMP_TIMEOUT } from "state/actions/notifications";
import { useNotifications } from "state/definitions";
import { SettaNotification } from "utils/generatedTypes";

const NOTIFICATION_FADE_MS = 150;

export function Notification() {
  // State to track the notification to display in the navbar
  const [displayNotification, setDisplayNotification] =
    useState<SettaNotification | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const lastShownNotificationIdRef = useRef<string | null>(null);

  // Get the most recent notification from the store
  const latestNotification = useNotifications((state) =>
    state.notifications.length > 0 ? state.notifications[0] : null,
  );

  // Effect to handle new notifications
  useEffect(() => {
    // Only run if latestNotification exists and is different from what's displayed
    if (
      latestNotification &&
      latestNotification.id !== lastShownNotificationIdRef.current
    ) {
      const timeoutDuration = DEFAULT_TEMP_TIMEOUT;
      const nowTime = new Date().getTime();
      const notificationTime = new Date(latestNotification.timestamp).getTime();
      if (nowTime - notificationTime > timeoutDuration) {
        lastShownNotificationIdRef.current = latestNotification.id;
        return;
      }

      // Update what's being displayed
      lastShownNotificationIdRef.current = latestNotification.id;
      setDisplayNotification(latestNotification);
      setIsVisible(false);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });

      const fadeStartTimeoutId = window.setTimeout(
        () => {
          setIsVisible(false);
        },
        Math.max(timeoutDuration - NOTIFICATION_FADE_MS, 0),
      );

      return () => {
        clearTimeout(fadeStartTimeoutId);
      };
    }
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

  return (
    <div
      className={[
        "flex min-w-0 items-center gap-0.5 transition-opacity duration-150 ease-out",
        isVisible ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      {getNotificationIcon(type, "ml-2 h-3 w-3 md:ml-4")}
      <p className="ml-2 hidden min-w-0 flex-1 self-center truncate text-xs text-setta-500 dark:text-setta-100 md:block">
        {message}
      </p>
    </div>
  );
}
