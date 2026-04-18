import type { NotificationsNotification } from "openapi/http";
import {
  NotificationTypeEnum,
  type NotificationType,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

export type AppNotification = Omit<NotificationsNotification, "type"> & {
  type: NotificationType;
};

type CreateAppNotificationArgs = Omit<Partial<AppNotification>, "type"> &
  Pick<AppNotification, "message" | "projectConfigId" | "temporary" | "type">;

function normalizeNotificationType(type: string): NotificationType {
  switch (type) {
    case NotificationTypeEnum.error:
    case NotificationTypeEnum.warning:
    case NotificationTypeEnum.info:
    case NotificationTypeEnum.save:
      return type;
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

export function coerceAppNotification(
  notification: NotificationsNotification | AppNotification,
): AppNotification {
  return {
    ...notification,
    type: normalizeNotificationType(notification.type),
  };
}

export function coerceAppNotifications(
  notifications: NotificationsNotification[],
): AppNotification[] {
  return notifications.map(coerceAppNotification);
}

export function createAppNotification(
  options: CreateAppNotificationArgs,
): AppNotification {
  return {
    id: options.id ?? createNewId(),
    message: options.message,
    metadata: options.metadata ?? {},
    projectConfigId: options.projectConfigId,
    read_status: options.read_status ?? false,
    temporary: options.temporary,
    timestamp: options.timestamp ?? new Date().toISOString(),
    type: options.type,
  };
}
