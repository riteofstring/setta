import { useEffect, useRef, useState, useCallback } from "react";

// Event types from backend
const EventType = {
  PROJECT_CREATING: "project.creating",
  PROJECT_CREATED: "project.created",
  PROJECT_DEPLOYING: "project.deploying",
  PROJECT_READY: "project.ready",
  PROJECT_ERROR: "project.error",
  PROJECT_DELETED: "project.deleted",
  PROJECT_STATUS_CHANGED: "project.status_changed",
  MACHINE_STATE_CHANGED: "machine.state_changed",
  DEPLOYMENT_PROGRESS: "deployment.progress",
  CONNECTION_ESTABLISHED: "connection.established",
  HEARTBEAT: "heartbeat",
};

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const eventHandlers = useRef(new Map());

  // Get WebSocket URL based on environment
  const getWebSocketUrl = () => {
    // If VITE_API_URL is set, derive WS URL from it
    if (import.meta.env.VITE_API_URL) {
      const apiUrl = import.meta.env.VITE_API_URL;
      // Replace http with ws and https with wss
      const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws";
      console.log("Using WebSocket URL:", wsUrl);
      return wsUrl;
    }

    // Default to localhost for development
    if (import.meta.env.DEV) {
      return "ws://localhost:8000/ws";
    }

    // Production: use same host with wss
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log("Using WebSocket URL (fallback):", wsUrl);
    return wsUrl;
  };

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if already connected
    if (ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = getWebSocketUrl();
    console.log("Connecting to WebSocket:", wsUrl);

    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setConnectionError(null);

        // Clear any reconnect timeout
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("WebSocket event:", data);

          setLastEvent(data);

          // Call ALL registered handlers, not just for specific event type
          // This ensures handlers are called regardless of how they were registered
          eventHandlers.current.forEach((handlers, eventType) => {
            if (eventType === data.type) {
              handlers.forEach((handler) => {
                try {
                  handler(data);
                } catch (error) {
                  console.error(`Error in handler for ${eventType}:`, error);
                }
              });
            }
          });
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionError("WebSocket connection error");
      };

      ws.current.onclose = (event) => {
        console.log("WebSocket disconnected", event.code, event.reason);
        setIsConnected(false);

        // Attempt to reconnect after 3 seconds
        reconnectTimeout.current = setTimeout(() => {
          console.log("Attempting to reconnect...");
          connect();
        }, 3000);
      };
    } catch (error) {
      console.error("Failed to connect to WebSocket:", error);
      setConnectionError(error.message);
    }
  }, []);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, []);

  // Subscribe to specific event types
  const subscribe = useCallback((eventType, handler) => {
    console.log(`Subscribing to event: ${eventType}`);

    if (!eventHandlers.current.has(eventType)) {
      eventHandlers.current.set(eventType, []);
    }

    const handlers = eventHandlers.current.get(eventType);
    handlers.push(handler);

    console.log(
      `Handler registered for ${eventType}. Total handlers: ${handlers.length}`,
    );

    // Return unsubscribe function
    return () => {
      const handlers = eventHandlers.current.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
          console.log(`Handler unregistered for ${eventType}`);
        }
      }
    };
  }, []);

  // Send a message through WebSocket
  const sendMessage = useCallback((message) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not connected");
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    connectionError,
    subscribe,
    sendMessage,
    EventType,
  };
}
