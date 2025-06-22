import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function ProtectedRoute({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Only mark as ready when Clerk is loaded AND we have auth status
    if (isLoaded && isSignedIn && userId) {
      // Small delay to ensure token is available
      const timer = setTimeout(() => {
        setAuthReady(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isSignedIn, userId]);

  console.log("ProtectedRoute auth state:", {
    isLoaded,
    isSignedIn,
    userId,
    authReady,
  });

  // Show loading while Clerk initializes
  if (!isLoaded || (isSignedIn && !authReady)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-setta-600
                          dark:border-setta-400 mx-auto mb-4"
          ></div>
          <p className="text-setta-600 dark:text-setta-400">
            Authenticating...
          </p>
        </div>
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
