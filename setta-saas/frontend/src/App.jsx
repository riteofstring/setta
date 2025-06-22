import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import SignInPage from "./components/SignIn";
import SignUpPage from "./components/SignUp";
import ProjectsList from "./components/ProjectsList/ProjectsList";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import WebSocketDebug from "./components/WebSocketDebug";

function App() {
  // Check URL params and environment for debug mode
  const urlParams = new URLSearchParams(window.location.search);
  const debugFromUrl = urlParams.get("debug") === "true";
  const isDev = import.meta.env.DEV;

  // Initialize debug state from sessionStorage or URL
  const [showDebug, setShowDebug] = useState(() => {
    const savedState = sessionStorage.getItem("showWebSocketDebug");
    return savedState ? JSON.parse(savedState) : debugFromUrl;
  });

  // Save debug state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("showWebSocketDebug", JSON.stringify(showDebug));
  }, [showDebug]);

  // Expose toggle function to console for debugging
  useEffect(() => {
    window.toggleDebug = () => {
      setShowDebug((prev) => {
        const newState = !prev;
        sessionStorage.setItem("showWebSocketDebug", JSON.stringify(newState));
        console.log(
          `WebSocket debug panel ${newState ? "enabled" : "disabled"}`,
        );
        return newState;
      });
    };

    // Log instructions in dev mode
    if (isDev) {
      console.log(
        "%c🔧 WebSocket Debug Panel",
        "color: #4CAF50; font-weight: bold; font-size: 14px",
      );
      console.log("• Click the debug button in bottom-left corner");
      console.log("• Or run: window.toggleDebug()");
      console.log("• Or add ?debug=true to URL");
    }

    return () => {
      delete window.toggleDebug;
    };
  }, [isDev]);

  const toggleDebug = () => {
    setShowDebug((prev) => !prev);
  };

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-setta-100 dark:bg-setta-dark">
        <Header />

        <main className="flex-1">
          <Routes>
            {/* Public routes */}
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />

            {/* Protected routes */}
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <ProjectsList />
                </ProtectedRoute>
              }
            />

            {/* Root redirect */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Navigate to="/projects" replace />
                </ProtectedRoute>
              }
            />

            {/* Catch all redirect */}
            <Route path="*" element={<Navigate to="/sign-in" replace />} />
          </Routes>
        </main>

        {/* WebSocket Debug Panel - only show in dev mode or with explicit flag */}
        {(isDev || debugFromUrl) && showDebug && <WebSocketDebug />}

        {/* Debug mode button when panel is hidden */}
        {(isDev || debugFromUrl) && !showDebug && (
          <button
            onClick={toggleDebug}
            className="fixed bottom-4 left-4 px-3 py-1.5 text-xs bg-setta-200 dark:bg-setta-800
                       text-setta-600 dark:text-setta-400 rounded-md hover:bg-setta-300
                       dark:hover:bg-setta-700 transition-colors shadow-sm border border-setta-300
                       dark:border-setta-700"
            title="Show WebSocket Debug Panel"
          >
            🔧 Debug
          </button>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
