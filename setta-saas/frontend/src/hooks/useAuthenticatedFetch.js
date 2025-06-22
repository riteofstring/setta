import { useAuth } from "@clerk/clerk-react";
import { useCallback } from "react";

export function useAuthenticatedFetch() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const authenticatedFetch = useCallback(
    async (endpoint, options = {}) => {
      // Check if auth is loaded and user is signed in
      if (!isLoaded) {
        throw new Error("Authentication is still loading");
      }

      if (!isSignedIn) {
        throw new Error("User is not authenticated");
      }

      try {
        // Get fresh token with retry logic
        let token = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && !token) {
          attempts++;

          try {
            token = await getToken({ skipCache: attempts > 1 });

            if (!token && attempts < maxAttempts) {
              // Wait a bit before retrying
              await new Promise((resolve) =>
                setTimeout(resolve, 200 * attempts),
              );
            }
          } catch (error) {
            console.log(`Token fetch attempt ${attempts} failed:`, error);

            if (attempts === maxAttempts) {
              throw new Error(
                "Failed to get authentication token after multiple attempts",
              );
            }
          }
        }

        if (!token) {
          throw new Error("No authentication token available");
        }

        const url = `${API_URL}${endpoint}`;
        console.log(`Fetching: ${url}`);

        const response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        // Log response status for debugging
        console.log(`Response status: ${response.status}`);

        // Handle auth errors specifically
        if (response.status === 401) {
          console.log("Got 401, attempting to refresh token...");

          // Force a fresh token
          const freshToken = await getToken({ skipCache: true });

          if (freshToken && freshToken !== token) {
            console.log("Got fresh token, retrying request...");

            // Retry with fresh token
            const retryResponse = await fetch(url, {
              ...options,
              headers: {
                ...options.headers,
                Authorization: `Bearer ${freshToken}`,
                "Content-Type": "application/json",
              },
            });

            if (retryResponse.status === 401) {
              throw new Error("Authentication failed. Please sign in again.");
            }

            return retryResponse;
          }

          throw new Error("Authentication failed. Please sign in again.");
        }

        return response;
      } catch (error) {
        // Add more context to network errors
        if (error.name === "TypeError" && error.message === "Failed to fetch") {
          throw new Error(
            `Network error: Unable to reach the server at ${API_URL}`,
          );
        }

        throw error;
      }
    },
    [getToken, isLoaded, isSignedIn, API_URL],
  );

  return authenticatedFetch;
}
