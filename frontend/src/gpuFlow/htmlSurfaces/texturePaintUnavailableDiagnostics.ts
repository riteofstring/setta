export function recordHtmlSurfacePaintUnavailableUpload({
  error,
  surfaceId,
}: {
  readonly error: unknown;
  readonly surfaceId: string;
}): void {
  const errorRecord =
    error && typeof error === "object"
      ? (error as { readonly message?: unknown; readonly name?: unknown })
      : null;
  const view = globalThis as typeof globalThis & {
    __SETTA_GPU_FLOW_HTML_SURFACE_PAINT_UNAVAILABLE_UPLOADS__?: unknown[];
  };
  const records =
    view.__SETTA_GPU_FLOW_HTML_SURFACE_PAINT_UNAVAILABLE_UPLOADS__ ?? [];
  records.push({
    message:
      typeof errorRecord?.message === "string" ? errorRecord.message : "",
    name: typeof errorRecord?.name === "string" ? errorRecord.name : "",
    surfaceId,
  });
  view.__SETTA_GPU_FLOW_HTML_SURFACE_PAINT_UNAVAILABLE_UPLOADS__ =
    records.slice(-20);
}
