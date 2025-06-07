// Replace frontend/src/components/WebSocketDebug.jsx with this version

import { useEffect, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";

function WebSocketDebug() {
  const { isConnected, lastEvent, connectionError, subscribe, EventType } =
    useWebSocket();
  const [events, setEvents] = useState([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState({});

  useEffect(() => {
    console.log("WebSocketDebug: Setting up subscriptions");
    console.log("Available event types:", EventType);

    const unsubscribers = [];
    const status = {};

    // Subscribe to each event type
    Object.entries(EventType).forEach(([key, eventType]) => {
      console.log(`Subscribing to: ${eventType}`);
      status[eventType] = true;

      const unsubscribe = subscribe(eventType, (event) => {
        console.log(`[WebSocket Event Received] ${eventType}:`, event);
        setEvents((prev) => [
          {
            type: eventType,
            data: event.data,
            timestamp: new Date().toLocaleTimeString(),
            raw: event,
          },
          ...prev.slice(0, 19), // Keep last 20 events
        ]);
      });

      unsubscribers.push(unsubscribe);
    });

    setSubscriptionStatus(status);

    // Also log any raw lastEvent changes
    console.log("Current lastEvent:", lastEvent);

    return () => {
      console.log("WebSocketDebug: Cleaning up subscriptions");
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [subscribe, EventType, lastEvent]);

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-setta-850 rounded-lg shadow-lg p-4 border border-setta-200 dark:border-setta-700 max-h-[80vh] overflow-y-auto">
      <h3 className="font-bold text-sm mb-2">WebSocket Debug</h3>

      <div className="text-xs space-y-1 mb-3">
        <div
          className={`flex items-center gap-2 ${isConnected ? "text-green-600" : "text-red-600"}`}
        >
          <span className="text-lg">●</span>
          <span>{isConnected ? "Connected" : "Disconnected"}</span>
        </div>

        {connectionError && (
          <div className="text-red-500">Error: {connectionError}</div>
        )}

        <div className="text-setta-500">
          API URL: {import.meta.env.VITE_API_URL || "Not set"}
        </div>

        <div className="text-setta-400">
          Subscribed to: {Object.keys(subscriptionStatus).length} event types
        </div>
      </div>

      <div className="border-t border-setta-200 dark:border-setta-700 pt-2">
        <h4 className="font-semibold text-xs mb-1">
          Events ({events.length}):
        </h4>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-xs text-setta-400">
              No project events yet... Try creating or deleting a project.
            </div>
          ) : (
            events.map((event, index) => (
              <div
                key={index}
                className="text-xs border-b border-setta-100 dark:border-setta-800 pb-1"
              >
                <div className="font-semibold text-setta-600 dark:text-setta-300">
                  [{event.timestamp}] {event.type}
                </div>
                <pre className="text-setta-500 dark:text-setta-400 text-[10px] overflow-x-auto">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>

      {lastEvent && (
        <div className="mt-2 pt-2 border-t border-setta-200 dark:border-setta-700">
          <h4 className="font-semibold text-xs">Raw Last Event:</h4>
          <pre className="text-[10px] text-setta-500 dark:text-setta-400 overflow-x-auto">
            {JSON.stringify(lastEvent, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-2 text-[10px] text-setta-400">
        Check browser console for detailed logs
      </div>
    </div>
  );
}

export default WebSocketDebug;
