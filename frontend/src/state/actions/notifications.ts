import type { NotificationsNotification } from "openapi/http";
import { useNotifications } from "state/definitions";
import {
  coerceAppNotification,
  createAppNotification,
  type AppNotification,
} from "state/types/notifications";
import { C } from "utils/c";
import {
  NotificationTypeEnum,
  type NotificationType,
} from "utils/generatedTypes";
import { getCurrProjectConfigId } from "./sectionInfos";

export const DEFAULT_TEMP_TIMEOUT = 2000;

// Standalone notification actions as separate functions
const addNotification = (notification: AppNotification) => {
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
  notification: NotificationsNotification,
) {
  const normalizedNotification = coerceAppNotification(notification);
  if (
    normalizedNotification.projectConfigId !== getCurrProjectConfigId() &&
    normalizedNotification.projectConfigId !==
      C.NOTIFICATION_IS_FOR_ALL_PROJECTS
  ) {
    return;
  }
  addNotification(createAppNotification(normalizedNotification));
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
}): AppNotification {
  return createAppNotification({
    projectConfigId,
    type,
    message,
    temporary,
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
