import { useNotifications, useProjectState } from "state/definitions";
import { C } from "utils/c";
import { SettaNotification, SettaNotificationType } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

export const DEFAULT_TEMP_TIMEOUT = 2000;

// Standalone notification actions as separate functions
const addNotification = (notification: SettaNotification) => {
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
    }, DEFAULT_TEMP_TIMEOUT);
  }
};

export const markAsRead = (notificationId: string) => {
  useNotifications.setState((state) => ({
    notifications: state.notifications.map((n) =>
      n.id === notificationId ? { ...n, read_status: true } : n,
    ),
  }));
};

export const removeNotification = (notificationId: string) => {
  useNotifications.setState((state) => ({
    notifications: state.notifications.filter((n) => n.id !== notificationId),
  }));
};

export function addNotificationFromWebsocketMsg(
  notification: SettaNotification,
) {
  if (
    !notification ||
    (notification.projectConfigId !==
      useProjectState.getState().projectConfigId &&
      notification.projectConfigId !== C.NOTIFICATION_IS_FOR_ALL_PROJECTS)
  ) {
    return;
  }
  if (!notification.timestamp) {
    notification.timestamp = new Date().toISOString();
  }
  addNotification(notification);
}

export const addTemporaryNotification = (
  message: string,
  type = SettaNotificationType.INFO,
) => {
  const id = createNewId();
  const notification: SettaNotification = {
    id,
    projectConfigId: useProjectState.getState().projectConfigId,
    timestamp: new Date().toISOString(),
    type,
    message,
    read_status: false,
    temporary: true,
    metadata: {},
  };

  addNotification(notification);
  return id;
};
