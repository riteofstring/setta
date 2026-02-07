import { AppRenderer } from "components/App/AppRenderer";
import { resolveAppTheme } from "components/App/appTheme";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  useAllProjectMetadata,
  useAppDefinition,
  useShareSession,
} from "state/definitions";
import type { AppRoute } from "utils/generatedTypes";
import { AppAssets } from "./AppAssets";

function normalizeRoutePath(path: string) {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

function resolveActiveRoute(
  routes: AppRoute[] | undefined,
  pathname: string,
): AppRoute | null {
  if (!routes || routes.length === 0) {
    return null;
  }
  const normalizedPath = normalizeRoutePath(pathname);
  return (
    routes.find((route) => normalizeRoutePath(route.path) === normalizedPath) ??
    null
  );
}

function hasRootKey(appSpec: unknown | null, rootKey: string) {
  if (!appSpec || typeof appSpec !== "object") {
    return false;
  }
  const record = appSpec as Record<string, unknown>;
  const elements = record.elements;
  if (!elements || typeof elements !== "object") {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(elements, rootKey);
}

export function AppPage() {
  const location = useLocation();
  const appSpec = useAppDefinition((x) => x.appSpec);
  const appDefinition = useAppDefinition((x) => x.appDefinition);
  const appPolicy = useShareSession((x) => x.sharePolicy);
  const resolvedTheme = useMemo(
    () => resolveAppTheme(appDefinition?.theme),
    [appDefinition?.theme],
  );
  const { defaultProjectConfigId, projectMetadata } = useAllProjectMetadata(
    (x) => x,
  );
  const routes = appDefinition?.routes ?? [];
  const activeRoute = resolveActiveRoute(routes, location.pathname);
  const routeRootKey = activeRoute?.rootKey ?? null;
  const hasRoutes = routes.length > 0;
  const routeError = hasRoutes && !activeRoute ? "App page not found." : null;
  const rootError =
    routeRootKey && !hasRootKey(appSpec, routeRootKey)
      ? "App route root not found in spec."
      : null;
  const defaultConfigName = projectMetadata.find(
    (config) => config.id === defaultProjectConfigId,
  )?.name;
  const appTitle =
    activeRoute?.name ??
    appDefinition?.routes?.[0]?.name ??
    appDefinition?.catalogId ??
    defaultConfigName ??
    "App";
  const themeClassName = resolvedTheme.className ?? "";
  const mainStyle: CSSProperties = {};
  if (resolvedTheme.colors.background) {
    mainStyle.background = resolvedTheme.colors.background;
  }
  if (
    resolvedTheme.spacing.pagePaddingX !== undefined ||
    resolvedTheme.spacing.pagePaddingY !== undefined
  ) {
    const resolvedPadX =
      resolvedTheme.spacing.pagePaddingX !== undefined
        ? resolvedTheme.spacing.pagePaddingX
        : 16;
    const resolvedPadY =
      resolvedTheme.spacing.pagePaddingY !== undefined
        ? resolvedTheme.spacing.pagePaddingY
        : 32;
    const padX =
      typeof resolvedPadX === "number" ? `${resolvedPadX}px` : resolvedPadX;
    const padY =
      typeof resolvedPadY === "number" ? `${resolvedPadY}px` : resolvedPadY;
    mainStyle.padding = `${padY} ${padX}`;
  }
  const contentStyle: CSSProperties = {};
  if (resolvedTheme.spacing.contentWidth !== undefined) {
    const width = resolvedTheme.spacing.contentWidth;
    contentStyle.maxWidth = typeof width === "number" ? `${width}px` : width;
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${themeClassName}`.trim()}
      style={resolvedTheme.style as CSSProperties}
    >
      <AppAssets assets={appDefinition?.assets ?? null} />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-setta-200 bg-white/90 px-6 py-4 dark:border-setta-800 dark:bg-setta-950/80 border-[color:var(--app-border)] bg-[color:var(--app-header-bg)]">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-setta-400 dark:text-setta-500 text-[color:var(--app-muted)]">
            App Mode
          </span>
          <h1 className="text-lg font-semibold text-setta-800 dark:text-setta-100 text-[color:var(--app-header-text)]">
            {appTitle}
          </h1>
        </div>
        {appPolicy && (
          <div className="text-xs text-setta-500 dark:text-setta-400 text-[color:var(--app-muted)]">
            {appPolicy.allowRun ? "Runs enabled" : "Runs disabled"}
          </div>
        )}
      </header>

      <main
        className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_45%),linear-gradient(180deg,_rgba(248,250,252,0.9),_rgba(226,232,240,0.6))] px-4 py-8 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_45%),linear-gradient(180deg,_rgba(15,23,42,0.9),_rgba(2,6,23,0.9))] bg-[color:var(--app-background)]"
        style={mainStyle}
      >
        <div className="w-full max-w-5xl" style={contentStyle}>
          {routeError || rootError ? (
            <div className="rounded-2xl border border-dashed border-setta-200 bg-white/70 px-6 py-10 text-center text-sm text-setta-500 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-300">
              {routeError ?? rootError}
            </div>
          ) : (
            <AppRenderer
              appSpec={appSpec}
              appDefinition={appDefinition}
              appPolicy={appPolicy}
              defaultConfigId={defaultProjectConfigId}
              rootKeyOverride={routeRootKey}
            />
          )}
        </div>
      </main>
    </div>
  );
}
