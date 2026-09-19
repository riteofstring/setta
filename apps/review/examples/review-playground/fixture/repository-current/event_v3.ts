import { eventBus } from "./event_bus";

export type CheckoutEvent = {
  schemaVersion: 3;
  emittedAt: string;
  traceId: string;
  payload: unknown;
};

export function publish(event: CheckoutEvent): void {
  eventBus.send("checkout-v3", event);
}
