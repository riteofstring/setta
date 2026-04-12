import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/inter";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "@fontsource/source-code-pro/500.css";
import "@fontsource/work-sans";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "@fontsource/work-sans/700.css";
import { lazy, Suspense } from "react";

const LazyAppRouterProvider = lazy(async () => {
  const mod = await import("./AppRouterProvider");
  return { default: mod.AppRouterProvider };
});

export function AppLoadingFallback() {
  return (
    <section
      data-testid="app-router-loading-state"
      data-setta-open-phase="app_router_loading"
      className="flex min-h-screen w-screen items-center justify-center bg-white px-6 py-10 text-setta-900 dark:bg-setta-950 dark:text-setta-50"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">Loading Setta...</p>
          <p className="text-xs text-setta-500 dark:text-setta-300">
            Preparing the app surface.
          </p>
        </div>
      </div>
    </section>
  );
}

export function App() {
  return (
    <Suspense fallback={<AppLoadingFallback />}>
      <LazyAppRouterProvider />
    </Suspense>
  );
}
