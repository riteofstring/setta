import { eventBus } from "./event_bus";

export type CheckoutEvent = {
  schemaVersion: 2;
  occurredAt: string;
  payload: unknown;
};

export function publish(event: CheckoutEvent): void {
  eventBus.send("checkout", event);
}
