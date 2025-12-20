import { useEffect, useRef, useState } from "react";
import { DEFAULT_TEMP_TIMEOUT } from "state/actions/notifications";
import { useLocalStorage, useNotifications, useSettings } from "state/definitions";
import { shortcutPrettified } from "utils/utils";

const HELP_TEXT_FADE_MS = 150;

export function HelpText() {
  const showMessage = useLocalStorage((x) => x.showNavBarHelpMessage);
  const shortcut = useSettings((x) =>
    shortcutPrettified(x.shortcuts.showTooltipShortcut),
  );

  const latestNotificationInfo = useNotifications((state) => {
    const latest = state.notifications[0];
    if (!latest) {
      return null;
    }
    const { id, timestamp } = latest;
    return { id, timestamp };
  });

  const hideTimeoutId = useRef<number | null>(null);
  const lastSeenNotificationId = useRef<string | null>(null);
  const [hideDueToNotification, setHideDueToNotification] = useState(false);

  useEffect(() => {
    if (!latestNotificationInfo) {
      return;
    }

    if (lastSeenNotificationId.current === latestNotificationInfo.id) {
      return;
    }
    lastSeenNotificationId.current = latestNotificationInfo.id;

    const notificationTime = new Date(latestNotificationInfo.timestamp).getTime();
    if (new Date().getTime() - notificationTime > DEFAULT_TEMP_TIMEOUT) {
      return;
    }

    if (hideTimeoutId.current) {
      clearTimeout(hideTimeoutId.current);
    }

    setHideDueToNotification(true);
    hideTimeoutId.current = window.setTimeout(() => {
      hideTimeoutId.current = null;
      setHideDueToNotification(false);
    }, DEFAULT_TEMP_TIMEOUT);
  }, [latestNotificationInfo]);

  useEffect(() => {
    return () => {
      if (hideTimeoutId.current) {
        clearTimeout(hideTimeoutId.current);
        hideTimeoutId.current = null;
      }
    };
  }, []);

  const shouldShow = showMessage && !hideDueToNotification;

  const [mounted, setMounted] = useState(shouldShow);
  const [isVisible, setIsVisible] = useState(shouldShow);

  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
      setIsVisible(false);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return;
    }

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => {
      setMounted(false);
    }, HELP_TEXT_FADE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [shouldShow]);

  return (
    mounted && (
      <aside
        className={[
          "ml-auto mr-4 flex items-center gap-2 transition-opacity duration-150 ease-out",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <div className="hidden items-center gap-2 lg:flex">
          <p className="text-xs font-bold text-setta-400 dark:text-setta-500">
            Hold &quot;{shortcut}&quot; for tool tips
          </p>
          <button
            className="flex cursor-pointer items-center text-setta-300 hover:text-setta-700 dark:text-setta-500 dark:hover:text-setta-400"
            onClick={() =>
              useLocalStorage.setState({ showNavBarHelpMessage: false })
            }
          >
            <i className="gg-close" />
          </button>
        </div>
      </aside>
    )
  );
}
