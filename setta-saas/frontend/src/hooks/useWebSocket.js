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
      return apiUrl.replace(/^http/, "ws") + "/ws";
    }

    // Default to localhost for development
    if (import.meta.env.DEV) {
      return "ws://localhost:8000/ws";
    }

    // Production: use same host with wss
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
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

          // Call any registered handlers for this event type
          const handlers = eventHandlers.current.get(data.type) || [];
          handlers.forEach((handler) => handler(data));
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
    if (!eventHandlers.current.has(eventType)) {
      eventHandlers.current.set(eventType, []);
    }

    const handlers = eventHandlers.current.get(eventType);
    handlers.push(handler);

    // Return unsubscribe function
    return () => {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
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
