import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import {
  IoAlertCircleSharp,
  IoClose,
  IoInformationCircle,
  IoWarning,
} from "react-icons/io5";
import { MdNotificationsNone } from "react-icons/md";
import { TbLogs } from "react-icons/tb";
import { VscSave } from "react-icons/vsc";
import {
  DEFAULT_TEMP_TIMEOUT,
  markAsRead,
  removeNotification,
} from "state/actions/notifications"; // Assuming this import path
import {
  useLocalStorage,
  useNotifications,
  useProjectState,
} from "state/definitions";
import {
  OverviewNotificationsPaneTabEnum,
  type OverviewNotificationsPaneTab,
} from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_notification,
  route_get_notifications,
} from "utils/generatedEndpoints";
import {
  SettaNotification,
  SettaNotificationType,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { BackendLogEventsArea } from "./BackendLogEventsArea";

export function NotificationsArea() {
  // Get all notifications from the store, including temporary ones
  const notifications = useNotifications(
    (state) => state.notifications,
    _.isEqual,
  );
  const persistedPaneTab = useLocalStorage(
    (state) => state.overviewNotificationsPaneTab,
  );
  const activePaneTab = persistedPaneTab;

  const projectConfigId = useProjectState((x) => x.projectConfig.id);

  const setActivePaneTab = useCallback(
    (nextTab: OverviewNotificationsPaneTab) => {
      if (persistedPaneTab === nextTab) {
        return;
      }
      useLocalStorage.setState({
        overviewNotificationsPaneTab: nextTab,
      });
    },
    [persistedPaneTab],
  );

  // Fetch notifications when component mounts
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await route_get_notifications({ projectConfigId });
        if (res200(response)) {
          // Set the notifications in the store
          useNotifications.setState((state) => ({
            notifications: [
              ...state.notifications.filter((n) => n.temporary),
              ...response.data,
            ],
          }));
        }
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      }
    };

    if (projectConfigId) {
      fetchNotifications();
    }
  }, [projectConfigId]);

  let paneBody = <NotificationsList notifications={notifications} />;
  if (activePaneTab === OverviewNotificationsPaneTabEnum.BackendLogs) {
    paneBody = (
      <div
        data-testid="notifications-pane-backend-logs-view"
        className="h-full min-h-0"
      >
        <BackendLogEventsArea />
      </div>
    );
  }

  return (
    <div
      data-testid="notifications-pane-shell"
      className="flex h-full min-h-0 w-full flex-col gap-2"
    >
      <div
        role="tablist"
        aria-label="Notifications pane tabs"
        className="inline-flex w-fit items-center gap-1 rounded-md bg-setta-100 p-1 text-[11px] dark:bg-setta-850"
      >
        <button
          type="button"
          role="tab"
          aria-selected={
            activePaneTab === OverviewNotificationsPaneTabEnum.Notifications
          }
          data-testid="notifications-pane-tab-notifications"
          onClick={() =>
            setActivePaneTab(OverviewNotificationsPaneTabEnum.Notifications)
          }
          className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold transition-colors ${
            activePaneTab === OverviewNotificationsPaneTabEnum.Notifications
              ? "bg-white text-setta-700 dark:bg-setta-800 dark:text-setta-100"
              : "text-setta-500 hover:text-setta-700 dark:text-setta-300 dark:hover:text-setta-100"
          }`}
        >
          <MdNotificationsNone size={13} aria-hidden />
          <span>Notifications</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={
            activePaneTab === OverviewNotificationsPaneTabEnum.BackendLogs
          }
          data-testid="notifications-pane-tab-backend-logs"
          onClick={() =>
            setActivePaneTab(OverviewNotificationsPaneTabEnum.BackendLogs)
          }
          className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold transition-colors ${
            activePaneTab === OverviewNotificationsPaneTabEnum.BackendLogs
              ? "bg-white text-setta-700 dark:bg-setta-800 dark:text-setta-100"
              : "text-setta-500 hover:text-setta-700 dark:text-setta-300 dark:hover:text-setta-100"
          }`}
        >
          <TbLogs size={13} aria-hidden />
          <span>Logs</span>
        </button>
      </div>
      <div className="min-h-0 flex-1">{paneBody}</div>
    </div>
  );
}

function NotificationsList({
  notifications,
}: {
  notifications: Array<SettaNotification>;
}) {
  return (
    <div
      data-testid="notifications-pane-notifications-view"
      className="setta-pane-scroll flex h-full w-full flex-col gap-4"
    >
      {notifications.length > 0 ? (
        notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))
      ) : (
        <div className="my-auto flex flex-col items-center justify-center py-8 text-setta-400 transition-all dark:text-setta-500">
          <IoInformationCircle size={24} />
          <p className="mt-2 text-sm">No notifications yet</p>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
}: {
  notification: SettaNotification;
}) {
  const { id, type, message, timestamp, read_status, temporary } = notification;
  const [isExiting, setIsExiting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(temporary ? 100 : 0);

  // Format timestamp for display - convert UTC to local time
  const formattedTime = new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });

  // Handle removing a notification
  const handleRemove = async () => {
    if (temporary) {
      setIsExiting(true);
      setTimeout(() => {
        removeNotification(id);
      }, 300); // Match transition duration
    } else {
      removeNotification(id);
      await route_delete_notification({ notificationId: id });
    }
  };

  // Handle marking a notification as read when interacted with
  const handleMarkAsRead = () => {
    if (!read_status) {
      markAsRead(id);
    }
  };

  // Timer effect for temporary notifications
  useEffect(() => {
    if (!temporary) return;

    const timeout = DEFAULT_TEMP_TIMEOUT * 0.95;
    // Update time remaining every 100ms
    const interval = setInterval(() => {
      const elapsed = Date.now() - new Date(timestamp).getTime();
      const remaining = Math.max(0, 100 - (elapsed / timeout) * 100);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setIsExiting(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [id, temporary]);

  return (
    <section
      className={`group/notifications overflow-clip rounded-md px-3 py-2 transition-all duration-300 hover:bg-white hover:shadow-md hover:dark:bg-setta-800 hover:dark:shadow-lg ${
        !read_status ? "bg-white shadow-md dark:bg-setta-700/30" : ""
      }  ${isExiting ? "opacity-0" : "opacity-100"}`}
      onClick={handleMarkAsRead}
    >
      <header className="mb-2 flex items-center gap-2">
        <i>{getNotificationIcon(type, "h-4 w-4")}</i>
        <h3 className="truncate font-semibold tracking-tight text-setta-600 group-hover/notifications:text-setta-900 dark:text-setta-300 group-hover/notifications:dark:text-setta-100">
          {message}
        </h3>
        <button
          className="ml-auto cursor-pointer text-setta-500 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation();
            handleRemove();
          }}
        >
          <IoClose size={15} />
        </button>
      </header>

      <div className="flex items-center justify-between">
        <p className="text-xs text-setta-600 group-hover/notifications:text-setta-900 dark:text-setta-100 group-hover/notifications:dark:text-white">
          {notification.metadata && notification.metadata.details
            ? notification.metadata.details
            : ""}
        </p>
        <span className="text-xs text-setta-400 dark:text-setta-500">
          {formattedTime}
        </span>
      </div>

      {temporary && (
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-blue-400 transition-all duration-100 ease-linear"
            style={{ width: `${timeRemaining}%` }}
          />
        </div>
      )}
    </section>
  );
}

export function getNotificationIcon(
  type: SettaNotificationType,
  className = "",
) {
  switch (type) {
    case SettaNotificationTypeEnum.error:
      return (
        <IoAlertCircleSharp
          className={`${className} text-red-500 dark:text-red-400`}
        />
      );
    case SettaNotificationTypeEnum.warning:
      return (
        <IoWarning
          className={`${className} text-yellow-500 dark:text-yellow-400`}
        />
      );
    case SettaNotificationTypeEnum.save:
      return (
        <VscSave
          className={`${className} text-setta-300 dark:text-setta-400`}
        />
      );
    case SettaNotificationTypeEnum.info:
    default:
      return (
        <IoInformationCircle
          className={`${className} text-blue-500 dark:text-blue-400`}
        />
      );
  }
}
