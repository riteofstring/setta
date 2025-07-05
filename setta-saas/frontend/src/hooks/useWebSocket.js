import { useEffect, useRef, useState, useCallback } from "react";

// Event types from backend - MUST match backend EventType enum
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
      console.log("Using WebSocket URL from VITE_API_URL:", wsUrl);
      return wsUrl;
    }

    // Default to localhost for development
    if (import.meta.env.DEV) {
      const wsUrl = "ws://localhost:8000/ws";
      console.log("Using development WebSocket URL:", wsUrl);
      return wsUrl;
    }

    // Production: use same host with wss
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log("Using production WebSocket URL:", wsUrl);
    return wsUrl;
  };

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if already connected
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected, skipping reconnect");
      return;
    }

    const wsUrl = getWebSocketUrl();
    console.log("🔌 Attempting WebSocket connection to:", wsUrl);

    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("✅ WebSocket connected successfully");
        setIsConnected(true);
        setConnectionError(null);

        // Log current subscriptions
        console.log("Current event handlers:", {
          count: eventHandlers.current.size,
          types: Array.from(eventHandlers.current.keys()),
        });

        // Clear any reconnect timeout
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
      };

      ws.current.onmessage = (event) => {
        console.log("📨 Raw WebSocket message received:", event.data);

        try {
          const data = JSON.parse(event.data);
          console.log("📦 Parsed WebSocket event:", {
            type: data.type,
            data: data.data,
            fullEvent: data,
          });

          setLastEvent(data);

          // Check if we have handlers for this event type
          const handlers = eventHandlers.current.get(data.type) || [];
          console.log(
            `🎯 Found ${handlers.length} handlers for event type: ${data.type}`,
          );

          if (handlers.length === 0) {
            console.warn(
              `⚠️ No handlers registered for event type: ${data.type}`,
            );
            console.log("Available event types:", Object.values(EventType));
            console.log(
              "Registered event types:",
              Array.from(eventHandlers.current.keys()),
            );
          }

          // Call each handler
          handlers.forEach((handler, index) => {
            try {
              console.log(
                `🔄 Calling handler ${index + 1}/${handlers.length} for ${data.type}`,
              );
              handler(data);
            } catch (error) {
              console.error(`❌ Error in handler for ${data.type}:`, error);
            }
          });

          // Also check if event type exists in our EventType enum
          const knownEventType = Object.values(EventType).includes(data.type);
          if (!knownEventType) {
            console.warn(
              `⚠️ Received unknown event type from backend: ${data.type}`,
            );
          }
        } catch (error) {
          console.error("❌ Error parsing WebSocket message:", error);
          console.error("Raw message was:", event.data);
        }
      };

      ws.current.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setConnectionError("WebSocket connection error");
      };

      ws.current.onclose = (event) => {
        console.log("🔌 WebSocket disconnected", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setIsConnected(false);

        // Attempt to reconnect after 3 seconds
        reconnectTimeout.current = setTimeout(() => {
          console.log("🔄 Attempting to reconnect...");
          connect();
        }, 3000);
      };
    } catch (error) {
      console.error("❌ Failed to create WebSocket connection:", error);
      setConnectionError(error.message);
    }
  }, []);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    console.log("🔌 Disconnecting WebSocket...");

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
    console.log(`📝 Subscribing to event: ${eventType}`);

    if (!eventHandlers.current.has(eventType)) {
      eventHandlers.current.set(eventType, []);
    }

    const handlers = eventHandlers.current.get(eventType);
    handlers.push(handler);

    console.log(
      `✅ Handler registered for ${eventType}. Total handlers for this type: ${handlers.length}`,
    );
    console.log(
      "All registered event types:",
      Array.from(eventHandlers.current.keys()),
    );

    // Return unsubscribe function
    return () => {
      const handlers = eventHandlers.current.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
          console.log(
            `🗑️ Handler unregistered for ${eventType}. Remaining handlers: ${handlers.length}`,
          );
        }
      }
    };
  }, []);

  // Send a message through WebSocket
  const sendMessage = useCallback((message) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log("📤 Sending WebSocket message:", message);
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn("⚠️ Cannot send message - WebSocket is not connected");
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    console.log("🚀 useWebSocket hook mounted, initiating connection...");
    connect();

    // Cleanup on unmount
    return () => {
      console.log("🛑 useWebSocket hook unmounting, cleaning up...");
      disconnect();
    };
  }, [connect, disconnect]);

  // Log connection state changes
  useEffect(() => {
    console.log("📊 WebSocket connection state:", {
      isConnected,
      connectionError,
      readyState: ws.current?.readyState,
      readyStateText: ws.current
        ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][ws.current.readyState]
        : "NO_SOCKET",
    });
  }, [isConnected, connectionError]);

  return {
    isConnected,
    lastEvent,
    connectionError,
    subscribe,
    sendMessage,
    EventType,
  };
}
