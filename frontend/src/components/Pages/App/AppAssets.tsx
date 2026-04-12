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

function resolveFirstString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = resolveString(record, key);
    if (value) {
      return value;
    }
  }
  return null;
}

function resolveAssetRel(
  record: Record<string, unknown>,
  type: string | null,
): string {
  const rel = resolveString(record, "rel");
  if (rel) {
    return rel;
  }
  if (type === "icon") {
    return "icon";
  }
  if (type === "preload") {
    return "preload";
  }
  return "stylesheet";
}

function resolveAssetAs(
  record: Record<string, unknown>,
  type: string | null,
): string | undefined {
  const asValue = resolveString(record, "as");
  if (asValue) {
    return asValue;
  }
  if (type === "font") {
    return "font";
  }
  return undefined;
}

function toOptionalString(value: string | null): string | undefined {
  return value ?? undefined;
}

function normalizeAsset(raw: unknown, index: number): NormalizedAsset | null {
  if (!isRecord(raw)) {
    return null;
  }
  const href = resolveFirstString(raw, ["href", "url", "path"]);
  if (!href) {
    return null;
  }
  const type = resolveString(raw, "type");
  const rel = resolveAssetRel(raw, type);
  return {
    key: `asset:${rel}:${href}:${index}`,
    rel,
    href,
    sizes: toOptionalString(resolveString(raw, "sizes")),
    type: toOptionalString(resolveString(raw, "mimeType")),
    as: resolveAssetAs(raw, type),
    crossOrigin: toOptionalString(resolveString(raw, "crossOrigin")),
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
