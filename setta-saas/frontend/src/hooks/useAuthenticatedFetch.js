import { useAuth } from "@clerk/clerk-react";

export function useAuthenticatedFetch() {
  const { getToken } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  return async (endpoint, options = {}) => {
    // Get fresh token for each request
    const token = await getToken();

    if (!token) {
      throw new Error("No authentication token available");
    }

    const url = `${API_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    // Handle auth errors
    if (response.status === 401) {
      throw new Error("Authentication failed");
    }

    return response;
  };
}
