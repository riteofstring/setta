import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SignInPage from "./components/SignIn";
import SignUpPage from "./components/SignUp";
import ProjectsList from "./components/ProjectsList/ProjectsList";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import WebSocketDebug from "./components/WebSocketDebug";

function App() {
  // Only show debug in development or with ?debug=true in URL
  const showDebug =
    import.meta.env.DEV || window.location.search.includes("debug=true");

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

        {/* WebSocket Debug Panel - only in development or with ?debug=true */}
        {showDebug && <WebSocketDebug />}
      </div>
    </BrowserRouter>
  );
}

export default App;
