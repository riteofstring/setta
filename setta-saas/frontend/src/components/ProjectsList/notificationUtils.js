// Use a counter to ensure unique IDs even in the same millisecond
let notificationIdCounter = 0;

export function generateNotificationId() {
  return `${Date.now()}-${++notificationIdCounter}`;
}

export const NOTIFICATION_DURATION = 5000; // 5 seconds
