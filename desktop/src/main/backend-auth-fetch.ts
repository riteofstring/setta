import type { BackendFetch } from "@shared/backend-runtime";

export function authenticatedBackendFetch(
  fetchImpl: BackendFetch,
  token: string,
  onUnauthorized: () => void,
): BackendFetch {
  return async (input, init) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetchImpl(input, { ...init, headers });
    if (response.status === 401) {
      onUnauthorized();
    }
    return response;
  };
}
