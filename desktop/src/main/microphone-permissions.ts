import type { Session, WebContents } from "electron";

type PermissionCheckHandler = NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>;
type PermissionRequestHandler = NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;

interface MainRendererMicrophonePermissionConfig {
  session: Pick<Session, "setPermissionCheckHandler" | "setPermissionRequestHandler">;
  trustedRendererURL: string;
  trustedWebContents: WebContents;
}

interface MediaPermissionDetails {
  isMainFrame: boolean;
  mediaType?: "audio" | "unknown" | "video";
  mediaTypes?: Array<"audio" | "video">;
  requestingUrl?: string;
  securityOrigin?: string;
}

export function configureMainRendererMicrophonePermissions({
  session,
  trustedRendererURL,
  trustedWebContents,
}: MainRendererMicrophonePermissionConfig): void {
  const policy = new MainRendererMicrophonePermissionPolicy(trustedRendererURL, trustedWebContents);
  const checkHandler: PermissionCheckHandler = (
    webContents,
    permission,
    requestingOrigin,
    details,
  ) => policy.check(webContents, permission, requestingOrigin, details);
  const requestHandler: PermissionRequestHandler = (webContents, permission, callback, details) =>
    callback(policy.request(webContents, permission, details));

  session.setPermissionCheckHandler(checkHandler);
  session.setPermissionRequestHandler(requestHandler);
}

export class MainRendererMicrophonePermissionPolicy {
  private readonly trustedDocumentURL: URL;

  constructor(
    trustedRendererURL: string,
    private readonly trustedWebContents: WebContents,
  ) {
    this.trustedDocumentURL = supportedRendererURL(trustedRendererURL);
  }

  check(
    webContents: WebContents | null,
    permission: string,
    requestingOrigin: string,
    details: MediaPermissionDetails,
  ): boolean {
    return (
      this.isTrustedMainFrame(webContents, permission, details) &&
      details.mediaType === "audio" &&
      this.isTrustedOrigin(requestingOrigin) &&
      this.isTrustedOptionalOrigin(details.securityOrigin)
    );
  }

  request(
    webContents: WebContents | null,
    permission: string,
    details: MediaPermissionDetails,
  ): boolean {
    return (
      this.isTrustedMainFrame(webContents, permission, details) &&
      requestsOnlyAudio(details.mediaTypes) &&
      this.isTrustedOptionalOrigin(details.securityOrigin)
    );
  }

  private isTrustedMainFrame(
    webContents: WebContents | null,
    permission: string,
    details: MediaPermissionDetails,
  ): boolean {
    return (
      permission === "media" &&
      webContents === this.trustedWebContents &&
      details.isMainFrame &&
      typeof details.requestingUrl === "string" &&
      sameDocument(details.requestingUrl, this.trustedDocumentURL)
    );
  }

  private isTrustedOptionalOrigin(origin: string | undefined): boolean {
    return origin === undefined || this.isTrustedOrigin(origin);
  }

  private isTrustedOrigin(origin: string): boolean {
    if (this.trustedDocumentURL.protocol === "file:") {
      return origin === "null" || parsedProtocol(origin) === "file:";
    }
    return parsedOrigin(origin) === this.trustedDocumentURL.origin;
  }
}

function supportedRendererURL(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "file:" && url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("trusted renderer URL must use file, http, or https");
  }
  url.hash = "";
  return url;
}

function sameDocument(value: string, trustedDocumentURL: URL): boolean {
  try {
    const candidate = new URL(value);
    candidate.hash = "";
    return candidate.href === trustedDocumentURL.href;
  } catch {
    return false;
  }
}

function parsedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parsedProtocol(value: string): string | null {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
}

function requestsOnlyAudio(mediaTypes: Array<"audio" | "video"> | undefined): boolean {
  return mediaTypes?.length === 1 && mediaTypes[0] === "audio";
}
