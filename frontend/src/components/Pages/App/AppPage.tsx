import { AppRenderer } from "components/App/AppRenderer";
import { resolveAppTheme } from "components/App/appTheme";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { BiMenu, BiX } from "react-icons/bi";
import { Link, useLocation } from "react-router-dom";
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
  let best: AppRoute | null = null;
  let bestLength = -1;
  for (const route of routes) {
    const routePath = normalizeRoutePath(route.path);
    const isMatch =
      normalizedPath === routePath ||
      (routePath !== "/" && normalizedPath.endsWith(routePath));
    if (!isMatch) {
      continue;
    }
    if (routePath.length > bestLength) {
      best = route;
      bestLength = routePath.length;
    }
  }
  return best;
}

function inferRouteBasePrefix(pathname: string, projectConfigNames: string[]) {
  const normalizedPath = normalizeRoutePath(pathname);
  if (normalizedPath === "/home" || normalizedPath.startsWith("/home/")) {
    return "/home";
  }

  if (projectConfigNames.length === 0) {
    return "/";
  }

  const configNames = new Set(projectConfigNames);
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }

  let configIdx = -1;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (configNames.has(segments[i])) {
      configIdx = i;
      break;
    }
  }
  if (configIdx < 0) {
    return "/";
  }

  let endIdx = configIdx + 1;
  if (segments[endIdx] === "view" && typeof segments[endIdx + 1] === "string") {
    endIdx = Math.min(endIdx + 2, segments.length);
  }

  return `/${segments.slice(0, endIdx).join("/")}`;
}

function resolveRoutePathWithinBase(pathname: string, basePrefix: string) {
  const normalizedPath = normalizeRoutePath(pathname);
  const normalizedBasePrefix = normalizeRoutePath(basePrefix);
  if (normalizedBasePrefix === "/") {
    return normalizedPath;
  }
  if (normalizedPath === normalizedBasePrefix) {
    return "/";
  }
  if (normalizedPath.startsWith(`${normalizedBasePrefix}/`)) {
    return normalizeRoutePath(
      normalizedPath.slice(normalizedBasePrefix.length),
    );
  }
  return normalizedPath;
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

function joinRouteHref(basePrefix: string, routePath: string) {
  const normalizedBasePrefix = normalizeRoutePath(basePrefix);
  const normalizedRoutePath = normalizeRoutePath(routePath);
  if (normalizedBasePrefix === "/") {
    return normalizedRoutePath;
  }
  if (normalizedRoutePath === "/") {
    return normalizedBasePrefix;
  }
  return `${normalizedBasePrefix}${normalizedRoutePath}`;
}

function inferNavBasePrefixFromSuffixMatch(
  pathname: string,
  activeRoute: AppRoute | null,
): string {
  const normalizedPath = normalizeRoutePath(pathname);
  if (activeRoute) {
    const routePath = normalizeRoutePath(activeRoute.path);
    if (normalizedPath === routePath) {
      return "/";
    }
    if (routePath !== "/" && normalizedPath.endsWith(routePath)) {
      const prefix = normalizedPath.slice(
        0,
        normalizedPath.length - routePath.length,
      );
      return prefix.length > 0 ? prefix : "/";
    }
    return "/";
  }

  return "/";
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
  const projectConfigNames = useMemo(
    () => projectMetadata.map((config) => config.name).filter(Boolean),
    [projectMetadata],
  );
  const routeBasePrefix = useMemo(
    () => inferRouteBasePrefix(location.pathname, projectConfigNames),
    [location.pathname, projectConfigNames],
  );
  const routePathWithinBase = useMemo(
    () => resolveRoutePathWithinBase(location.pathname, routeBasePrefix),
    [location.pathname, routeBasePrefix],
  );
  const activeRouteWithinBase = useMemo(
    () =>
      routes.find(
        (route) =>
          normalizeRoutePath(route.path) ===
          normalizeRoutePath(routePathWithinBase),
      ) ?? null,
    [routePathWithinBase, routes],
  );
  const activeRoute =
    activeRouteWithinBase ?? resolveActiveRoute(routes, location.pathname);
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
    defaultConfigName ??
    appDefinition?.catalogId ??
    "App";
  const themeClassName = resolvedTheme.className ?? "";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);
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
  const navBasePrefix =
    activeRouteWithinBase != null
      ? routeBasePrefix
      : inferNavBasePrefixFromSuffixMatch(location.pathname, activeRoute);
  const navRoutes = routes.map((route) => {
    const normalizedRoutePath = normalizeRoutePath(route.path);
    const href = joinRouteHref(navBasePrefix, normalizedRoutePath);
    const label =
      typeof route.name === "string" && route.name.trim().length > 0
        ? route.name
        : normalizedRoutePath;
    return {
      key: `${normalizedRoutePath}-${label}`,
      href,
      label,
      isActive:
        Boolean(activeRoute) &&
        normalizeRoutePath(activeRoute?.path ?? "") === normalizedRoutePath,
    };
  });

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${themeModeClassName} ${themeClassName}`.trim()}
      style={resolvedTheme.style as CSSProperties}
    >
      <AppAssets
        assets={appDefinition?.assets ?? null}
        allowExternalLinks={appPolicy?.allowExternalLinks ?? false}
      />
      <header className="sticky top-0 z-10 border-b border-[color:var(--app-border)] bg-[color:var(--app-header-bg)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {hasRoutes && (
              <button
                type="button"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-surface)] text-[color:var(--app-text)] transition-colors hover:bg-[color:var(--app-surface-alt)] md:hidden"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
              >
                {mobileMenuOpen ? (
                  <BiX className="h-5 w-5" />
                ) : (
                  <BiMenu className="h-5 w-5" />
                )}
              </button>
            )}
            <h1 className="min-w-0 truncate font-semibold text-[color:var(--app-header-text)] [font-size:var(--app-text-lg)]">
              {appTitle}
            </h1>
          </div>

          {hasRoutes && (
            <nav
              aria-label="Pages"
              className="hidden items-center gap-1 md:flex"
            >
              {navRoutes.map((route) => (
                <Link
                  key={route.key}
                  to={route.href}
                  className={`rounded-full px-3 py-1 font-semibold transition-colors [font-size:var(--app-text-xs)] ${
                    route.isActive
                      ? "bg-[color:var(--app-accent)] text-[color:var(--app-accent-text)] hover:bg-[color:var(--app-accent-hover)]"
                      : "bg-[color:var(--app-surface)] text-[color:var(--app-muted)] hover:bg-[color:var(--app-surface-alt)]"
                  }`}
                >
                  {route.label}
                </Link>
              ))}
            </nav>
          )}

          {appPolicy && (
            <div className="hidden text-[color:var(--app-muted)] [font-size:var(--app-text-xs)] md:block">
              {appPolicy.allowRun ? "Runs enabled" : "Runs disabled"}
            </div>
          )}
        </div>

        {hasRoutes && mobileMenuOpen && (
          <nav
            aria-label="Pages"
            className="border-t border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-3 md:hidden"
          >
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
              {navRoutes.map((route) => (
                <Link
                  key={route.key}
                  to={route.href}
                  className={`rounded-xl px-3 py-2 font-semibold transition-colors [font-size:var(--app-text-sm)] ${
                    route.isActive
                      ? "bg-[color:var(--app-accent)] text-[color:var(--app-accent-text)]"
                      : "bg-[color:var(--app-surface)] text-[color:var(--app-text)] hover:bg-[color:var(--app-surface-alt)]"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {route.label}
                </Link>
              ))}
              {appPolicy && (
                <div className="pt-2 text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
                  {appPolicy.allowRun ? "Runs enabled" : "Runs disabled"}
                </div>
              )}
            </div>
          </nav>
        )}
      </header>

      <main
        className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-[color:var(--app-background)] px-4 py-8"
        style={mainStyle}
      >
        <div className="w-full max-w-5xl" style={contentStyle}>
          {routeError || rootError ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-6 py-10 text-center text-[color:var(--app-muted)] [font-size:var(--app-text-sm)]">
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
