import { useNotifications } from "state/definitions";
import { C } from "utils/c";
import {
  createNotification,
  Notification,
  NotificationType,
  NotificationTypeEnum,
} from "utils/generatedTypes";
import { getCurrProjectConfigId } from "./sectionInfos";

export const DEFAULT_TEMP_TIMEOUT = 2000;

// Standalone notification actions as separate functions
const addNotification = (notification: Notification) => {
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

export function addNotificationFromWebsocketMsg(notification: Notification) {
  if (
    !notification ||
    (notification.projectConfigId !== getCurrProjectConfigId() &&
      notification.projectConfigId !== C.NOTIFICATION_IS_FOR_ALL_PROJECTS)
  ) {
    return;
  }
  if (!notification.timestamp) {
    notification.timestamp = new Date().toISOString();
  }
  addNotification(notification);
}

function createClientNotification({
  projectConfigId,
  message,
  type,
  temporary,
}: {
  projectConfigId: string;
  message: string;
  type: NotificationType;
  temporary: boolean;
}): Notification {
  return createNotification({
    projectConfigId,
    timestamp: new Date().toISOString(),
    type,
    message,
    read_status: false,
    temporary,
    metadata: {},
  });
}

export const addTemporaryNotification = (
  message: string,
  type: NotificationType = NotificationTypeEnum.info,
) => {
  const projectConfigId = getCurrProjectConfigId();
  const notification = createClientNotification({
    projectConfigId,
    message,
    type,
    temporary: true,
  });

  addNotification(notification);
  return notification.id;
};

export const addPersistentNotification = (
  message: string,
  type: NotificationType = NotificationTypeEnum.info,
) => {
  const projectConfigId = getCurrProjectConfigId();
  const existing = useNotifications
    .getState()
    .notifications.find(
      (notification) =>
        !notification.temporary &&
        notification.projectConfigId === projectConfigId &&
        notification.message === message &&
        notification.type === type,
    );
  if (existing) {
    return existing.id;
  }

  const notification = createClientNotification({
    projectConfigId,
    message,
    type,
    temporary: false,
  });

  addNotification(notification);
  return notification.id;
};
