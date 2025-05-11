import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import ProjectsList from "./components/ProjectsList";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-setta-100 dark:bg-setta-dark">
        <Header />

        <main className="flex-1">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <ProjectsList />
                </ProtectedRoute>
              }
            />

            {/* Redirect to login if no route matches */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
