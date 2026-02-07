import { useEffect, useMemo } from "react";

type NormalizedAsset = {
  key: string;
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
  as?: string;
  crossOrigin?: string;
};

const EXTERNAL_HREF_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isExternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("//")) {
    return true;
  }
  return EXTERNAL_HREF_RE.test(trimmed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function normalizeAsset(raw: unknown, index: number): NormalizedAsset | null {
  if (!isRecord(raw)) {
    return null;
  }
  const href =
    resolveString(raw, "href") ??
    resolveString(raw, "url") ??
    resolveString(raw, "path");
  if (!href) {
    return null;
  }
  const type = resolveString(raw, "type");
  const rel =
    resolveString(raw, "rel") ??
    (type === "icon" ? "icon" : type === "preload" ? "preload" : "stylesheet");
  const sizes = resolveString(raw, "sizes");
  const mimeType = resolveString(raw, "mimeType");
  const asValue = resolveString(raw, "as") ?? (type === "font" ? "font" : null);
  const crossOrigin = resolveString(raw, "crossOrigin");
  return {
    key: `asset:${rel}:${href}:${index}`,
    rel,
    href,
    sizes: sizes ?? undefined,
    type: mimeType ?? undefined,
    as: asValue ?? undefined,
    crossOrigin: crossOrigin ?? undefined,
  };
}

function normalizeAssets(assets: unknown): NormalizedAsset[] {
  if (!Array.isArray(assets)) {
    return [];
  }
  const output: NormalizedAsset[] = [];
  assets.forEach((asset, index) => {
    const normalized = normalizeAsset(asset, index);
    if (normalized) {
      output.push(normalized);
    }
  });
  return output;
}

export function resolveAppAssets(
  assets: unknown,
  options: { allowExternalLinks: boolean },
): NormalizedAsset[] {
  const normalized = normalizeAssets(assets);
  if (options.allowExternalLinks) {
    return normalized;
  }
  return normalized.filter((asset) => !isExternalHref(asset.href));
}

export function AppAssets({
  assets,
  allowExternalLinks = false,
}: {
  assets: unknown[] | null | undefined;
  allowExternalLinks?: boolean;
}) {
  const normalized = useMemo(
    () => resolveAppAssets(assets, { allowExternalLinks }),
    [assets, allowExternalLinks],
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (normalized.length === 0) {
      return;
    }
    const created: HTMLLinkElement[] = [];
    for (const asset of normalized) {
      if (document.querySelector(`link[data-setta-app-asset="${asset.key}"]`)) {
        continue;
      }
      const link = document.createElement("link");
      link.rel = asset.rel;
      link.href = asset.href;
      if (asset.sizes) {
        link.sizes = asset.sizes;
      }
      if (asset.type) {
        link.type = asset.type;
      }
      if (asset.as) {
        link.as = asset.as;
      }
      if (asset.crossOrigin) {
        link.crossOrigin = asset.crossOrigin;
      }
      link.dataset.settaAppAsset = asset.key;
      document.head.appendChild(link);
      created.push(link);
    }
    return () => {
      created.forEach((link) => link.remove());
    };
  }, [normalized]);

  return null;
}
