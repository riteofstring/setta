import type { BackendFetch } from "@shared/backend-runtime";

export type BackendAuthTokenProvider = () => Promise<string>;

export function authenticatedBackendFetch(
  fetchImpl: BackendFetch,
  tokenProvider: BackendAuthTokenProvider,
  onUnauthorized: () => void,
): BackendFetch {
  return async (input, init) => {
    const token = await tokenProvider();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetchImpl(input, { ...init, headers });
    if (response.status === 401) {
      onUnauthorized();
    }
    return response;
  };
}
