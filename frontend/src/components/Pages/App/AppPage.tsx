import { AppRenderer } from "components/App/AppRenderer";
import { resolveAppTheme } from "components/App/appTheme";
import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";
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

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const themeMode = resolvedTheme.mode;
    const themeClassName = resolvedTheme.className ?? "";
    const themeClasses = themeClassName.split(/\s+/).filter(Boolean);

    const previousDark = root.classList.contains("dark");
    const previousFontFamily = root.style.fontFamily;
    const previousVars: Record<string, string> = {};

    // Ensure portal-based UI (combobox menus, dropdowns, etc.) can inherit the
    // same app theme variables and dark mode.
    for (const [key, value] of Object.entries(resolvedTheme.style)) {
      if (key === "fontFamily" && typeof value === "string") {
        root.style.fontFamily = value;
        continue;
      }
      if (!key.startsWith("--")) {
        continue;
      }
      previousVars[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, String(value));
    }

    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    for (const cls of themeClasses) {
      root.classList.add(cls);
    }

    return () => {
      if (previousDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      for (const cls of themeClasses) {
        root.classList.remove(cls);
      }
      if (previousFontFamily) {
        root.style.fontFamily = previousFontFamily;
      } else {
        root.style.removeProperty("font-family");
      }
      for (const [key, previous] of Object.entries(previousVars)) {
        if (previous) {
          root.style.setProperty(key, previous);
        } else {
          root.style.removeProperty(key);
        }
      }
    };
  }, [resolvedTheme.className, resolvedTheme.mode, resolvedTheme.style]);

  const themeModeClassName = resolvedTheme.mode === "dark" ? "dark" : "";
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
  mainStyle.backgroundImage = "var(--app-page-bg-image)";
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
      className={`flex min-h-0 flex-1 flex-col ${themeModeClassName} ${themeClassName}`.trim()}
      style={resolvedTheme.style as CSSProperties}
    >
      <AppAssets
        assets={appDefinition?.assets ?? null}
        allowExternalLinks={appPolicy?.allowExternalLinks ?? false}
      />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--app-border)] bg-[color:var(--app-header-bg)] px-6 py-4">
        <div className="flex flex-col gap-1">
          <span className="[font-size:var(--app-text-xs)] font-semibold uppercase tracking-[0.24em] text-[color:var(--app-muted)]">
            App Mode
          </span>
          <h1 className="[font-size:var(--app-text-lg)] font-semibold text-[color:var(--app-header-text)]">
            {appTitle}
          </h1>
        </div>
        {appPolicy && (
          <div className="[font-size:var(--app-text-xs)] text-[color:var(--app-muted)]">
            {appPolicy.allowRun ? "Runs enabled" : "Runs disabled"}
          </div>
        )}
      </header>

      <main
        className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-[color:var(--app-background)] px-4 py-8"
        style={mainStyle}
      >
        <div className="w-full max-w-5xl" style={contentStyle}>
          {routeError || rootError ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-6 py-10 text-center [font-size:var(--app-text-sm)] text-[color:var(--app-muted)]">
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
