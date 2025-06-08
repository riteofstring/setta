import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbGetNotifications(projectConfigId) {
  return await post({
    body: { projectConfigId },
    address: RouteEnum.GET_NOTIFICATIONS,
  });
}

export async function dbDeleteNotification(notificationId) {
  return await post({
    body: { notificationId: String(notificationId) },
    address: RouteEnum.DELETE_NOTIFICATION,
  });
}
