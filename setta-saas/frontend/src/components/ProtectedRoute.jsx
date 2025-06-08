import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuth();

  console.log("ProtectedRoute auth state:", {
    isLoaded,
    isSignedIn,
    userId,
  });

  // Wait for auth to load
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-setta-600 dark:text-setta-400">Loading...</div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isSignedIn) {
    console.log("User not signed in, redirecting to sign-in");
    return <Navigate to="/sign-in" replace />;
  }

  console.log("User is signed in, rendering protected content");
  return children;
}
