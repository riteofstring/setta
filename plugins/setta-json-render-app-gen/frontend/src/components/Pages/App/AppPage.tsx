import { AppRenderer } from "../../App/AppRenderer";
import { resolveAppTheme } from "../../App/appTheme";
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

type ResolvedAppTheme = ReturnType<typeof resolveAppTheme>;

type AppPageViewModel = {
  appTitle: string;
  pageError: string | null;
  routeRootKey: string | null;
};

type AppPageStyles = {
  contentStyle: CSSProperties;
  mainStyle: CSSProperties;
  themeClassName: string;
  themeModeClassName: string;
};

type AppPageViewProps = {
  allowExternalLinks: boolean;
  appAssets:
    | NonNullable<
        ReturnType<typeof useAppDefinition.getState>["appDefinition"]
      >["assets"]
    | null;
  appDefinition: ReturnType<typeof useAppDefinition.getState>["appDefinition"];
  appPolicy: ReturnType<typeof useShareSession.getState>["sharePolicy"];
  appSpec: ReturnType<typeof useAppDefinition.getState>["appSpec"];
  appTitle: string;
  contentStyle: CSSProperties;
  defaultProjectConfigId: string | null;
  mainStyle: CSSProperties;
  pageError: string | null;
  resolvedTheme: ResolvedAppTheme;
  routeRootKey: string | null;
  themeClassName: string;
  themeModeClassName: string;
};

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

function resolveSpacingValue(value: string | number | undefined) {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? `${value}px` : value;
}

function buildAppPageStyles(resolvedTheme: ResolvedAppTheme): AppPageStyles {
  const mainStyle: CSSProperties = {
    backgroundImage: "var(--app-page-bg-image)",
  };
  const resolvedPadX = resolvedTheme.spacing.pagePaddingX ?? 16;
  const resolvedPadY = resolvedTheme.spacing.pagePaddingY ?? 32;
  if (
    resolvedTheme.spacing.pagePaddingX !== undefined ||
    resolvedTheme.spacing.pagePaddingY !== undefined
  ) {
    mainStyle.padding = `${resolveSpacingValue(resolvedPadY)} ${resolveSpacingValue(resolvedPadX)}`;
  }

  const contentStyle: CSSProperties = {};
  const contentWidth = resolveSpacingValue(resolvedTheme.spacing.contentWidth);
  if (contentWidth) {
    contentStyle.maxWidth = contentWidth;
  }

  return {
    contentStyle,
    mainStyle,
    themeClassName: resolvedTheme.className ?? "",
    themeModeClassName: resolvedTheme.mode === "dark" ? "dark" : "",
  };
}

function resolveAppPageTitle({
  activeRoute,
  routes,
  appDefinition,
  defaultProjectConfigId,
  projectMetadata,
}: {
  activeRoute: AppRoute | null;
  routes: AppRoute[];
  appDefinition: ReturnType<typeof useAppDefinition.getState>["appDefinition"];
  defaultProjectConfigId: string | null;
  projectMetadata: ReturnType<
    typeof useAllProjectMetadata.getState
  >["projectMetadata"];
}) {
  const defaultConfigName = projectMetadata.find(
    (config) => config.id === defaultProjectConfigId,
  )?.name;
  return (
    activeRoute?.name ??
    routes[0]?.name ??
    appDefinition?.catalogId ??
    defaultConfigName ??
    "App"
  );
}

function resolveAppPageError({
  activeRoute,
  appSpec,
  routeRootKey,
  routes,
}: {
  activeRoute: AppRoute | null;
  appSpec: ReturnType<typeof useAppDefinition.getState>["appSpec"];
  routeRootKey: string | null;
  routes: AppRoute[];
}) {
  if (routes.length > 0 && !activeRoute) {
    return "App page not found.";
  }
  if (routeRootKey && !hasRootKey(appSpec, routeRootKey)) {
    return "App route root not found in spec.";
  }
  return null;
}

function resolveAppPageViewModel({
  pathname,
  routes,
  appDefinition,
  appSpec,
  defaultProjectConfigId,
  projectMetadata,
}: {
  pathname: string;
  routes: AppRoute[];
  appDefinition: ReturnType<typeof useAppDefinition.getState>["appDefinition"];
  appSpec: ReturnType<typeof useAppDefinition.getState>["appSpec"];
  defaultProjectConfigId: string | null;
  projectMetadata: ReturnType<
    typeof useAllProjectMetadata.getState
  >["projectMetadata"];
}): AppPageViewModel {
  const activeRoute = resolveActiveRoute(routes, pathname);
  const routeRootKey = activeRoute?.rootKey ?? null;

  return {
    appTitle: resolveAppPageTitle({
      activeRoute,
      routes,
      appDefinition,
      defaultProjectConfigId,
      projectMetadata,
    }),
    pageError: resolveAppPageError({
      activeRoute,
      appSpec,
      routeRootKey,
      routes,
    }),
    routeRootKey,
  };
}

function applyResolvedThemeToRoot(
  root: HTMLElement,
  resolvedTheme: ResolvedAppTheme,
) {
  const themeClassName = resolvedTheme.className ?? "";
  const themeClasses = themeClassName.split(/\s+/).filter(Boolean);
  const previousDark = root.classList.contains("dark");
  const previousFontFamily = root.style.fontFamily;
  const previousVars: Record<string, string> = {};

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

  root.classList.toggle("dark", resolvedTheme.mode === "dark");
  for (const cls of themeClasses) {
    root.classList.add(cls);
  }

  return () => {
    root.classList.toggle("dark", previousDark);
    for (const cls of themeClasses) {
      root.classList.remove(cls);
    }
    if (previousFontFamily) {
      root.style.fontFamily = previousFontFamily;
    } else {
      root.style.removeProperty("font-family");
    }
    for (const [key, previousValue] of Object.entries(previousVars)) {
      if (previousValue) {
        root.style.setProperty(key, previousValue);
        continue;
      }
      root.style.removeProperty(key);
    }
  };
}

function useResolvedAppThemeDocumentRoot(resolvedTheme: ResolvedAppTheme) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    // Ensure portal-based UI (combobox menus, dropdowns, etc.) can inherit the
    // same app theme variables and dark mode.
    return applyResolvedThemeToRoot(document.documentElement, resolvedTheme);
  }, [resolvedTheme]);
}

function AppPageView({
  allowExternalLinks,
  appAssets,
  appDefinition,
  appPolicy,
  appSpec,
  appTitle,
  contentStyle,
  defaultProjectConfigId,
  mainStyle,
  pageError,
  resolvedTheme,
  routeRootKey,
  themeClassName,
  themeModeClassName,
}: AppPageViewProps) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${themeModeClassName} ${themeClassName}`.trim()}
      style={resolvedTheme.style as CSSProperties}
    >
      <AppAssets assets={appAssets} allowExternalLinks={allowExternalLinks} />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--app-border)] bg-[color:var(--app-header-bg)] px-6 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-semibold uppercase tracking-[0.24em] text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
            App Mode
          </span>
          <h1 className="font-semibold text-[color:var(--app-header-text)] [font-size:var(--app-text-lg)]">
            {appTitle}
          </h1>
        </div>
        {appPolicy && (
          <div className="text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
            {appPolicy.allowRun ? "Runs enabled" : "Runs disabled"}
          </div>
        )}
      </header>

      <main
        className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-[color:var(--app-background)] px-4 py-8"
        style={mainStyle}
      >
        <div className="w-full max-w-5xl" style={contentStyle}>
          {pageError ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-6 py-10 text-center text-[color:var(--app-muted)] [font-size:var(--app-text-sm)]">
              {pageError}
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

export function AppPage() {
  const location = useLocation();
  const appSpec = useAppDefinition((x) => x.appSpec);
  const appDefinition = useAppDefinition((x) => x.appDefinition);
  const appPolicy = useShareSession((x) => x.sharePolicy);
  const resolvedTheme = useMemo(
    () => resolveAppTheme(appDefinition?.theme),
    [appDefinition?.theme],
  );
  useResolvedAppThemeDocumentRoot(resolvedTheme);
  const { defaultProjectConfigId, projectMetadata } = useAllProjectMetadata(
    (x) => x,
  );
  const routes = appDefinition?.routes ?? [];
  const { appTitle, pageError, routeRootKey } = resolveAppPageViewModel({
    pathname: location.pathname,
    routes,
    appDefinition,
    appSpec,
    defaultProjectConfigId,
    projectMetadata,
  });
  const { contentStyle, mainStyle, themeClassName, themeModeClassName } =
    buildAppPageStyles(resolvedTheme);
  const appAssets = appDefinition?.assets ?? null;
  const allowExternalLinks = appPolicy?.allowExternalLinks ?? false;

  return (
    <AppPageView
      allowExternalLinks={allowExternalLinks}
      appAssets={appAssets}
      appDefinition={appDefinition}
      appPolicy={appPolicy}
      appSpec={appSpec}
      appTitle={appTitle}
      contentStyle={contentStyle}
      defaultProjectConfigId={defaultProjectConfigId}
      mainStyle={mainStyle}
      pageError={pageError}
      resolvedTheme={resolvedTheme}
      routeRootKey={routeRootKey}
      themeClassName={themeClassName}
      themeModeClassName={themeModeClassName}
    />
  );
}
