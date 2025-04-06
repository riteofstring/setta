import C from "constants/constants.json";
import { useNotifications, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

const DEFAULT_TEMP_TIMEOUT = 2000;

// Standalone notification actions as separate functions
const addNotification = (notification) => {
  useNotifications.setState((state) => ({
    notifications: [notification, ...state.notifications],
  }));

  if (notification.temporary) {
    setTimeout(() => {
      useNotifications.setState((state) => ({
        notifications: state.notifications.filter(
          (n) => n.id !== notification.id,
        ),
      }));
    }, getTimeoutDuration(notification));
  }
};

export const markAsRead = (notificationId) => {
  useNotifications.setState((state) => ({
    notifications: state.notifications.map((n) =>
      n.id === notificationId ? { ...n, read_status: true } : n,
    ),
  }));
};

export const removeNotification = (notificationId) => {
  useNotifications.setState((state) => ({
    notifications: state.notifications.filter((n) => n.id !== notificationId),
  }));
};

export function addNotificationFromWebsocketMsg(notification) {
  if (
    !notification ||
    (notification.projectConfigId !==
      useSectionInfos.getState().projectConfig.id &&
      notification.projectConfigId !== C.NOTIFICATION_IS_FOR_ALL_PROJECTS)
  ) {
    return;
  }
  if (!notification.timestamp) {
    notification.timestamp = new Date().toISOString();
    notification.dateObj = Date.now();
  }
  addNotification(notification);
}

export const addTemporaryNotification = (
  message,
  type = C.NOTIFICATION_TYPE_INFO,
  timeout = DEFAULT_TEMP_TIMEOUT,
) => {
  const id = createNewId();
  const notification = {
    id,
    timestamp: new Date().toISOString(),
    dateObj: Date.now(),
    type,
    message,
    read_status: false,
    temporary: true,
    source: "frontend",
    timeout,
  };

  addNotification(notification);
  return id;
};

export const getTimeoutDuration = (notification) =>
  notification.timeout || DEFAULT_TEMP_TIMEOUT;
