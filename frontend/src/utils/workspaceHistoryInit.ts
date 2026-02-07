import { hydrateWorkspaceHistoryFromWindowName } from "utils/workspaceHistory";

// Side-effect import used by `frontend/src/index.tsx` to hydrate workspace history
// early on app startup (window.name -> localStorage).
hydrateWorkspaceHistoryFromWindowName();
