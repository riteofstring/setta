import type { Session, WebContents } from "electron";
import { describe, expect, test, vi } from "vitest";

import {
  configureMainRendererMicrophonePermissions,
  MainRendererMicrophonePermissionPolicy,
} from "./microphone-permissions";

const trustedURL = "https://setta.test/app?workspace=one";

describe("main renderer microphone permission policy", () => {
  test("allows an audio check and request from the trusted main renderer", () => {
    const main = fakeWebContents();
    const policy = new MainRendererMicrophonePermissionPolicy(trustedURL, main);

    expect(
      policy.check(main, "media", "https://setta.test", {
        isMainFrame: true,
        mediaType: "audio",
        requestingUrl: trustedURL,
        securityOrigin: "https://setta.test",
      }),
    ).toBe(true);
    expect(
      policy.request(main, "media", {
        isMainFrame: true,
        mediaTypes: ["audio"],
        requestingUrl: trustedURL,
        securityOrigin: "https://setta.test",
      }),
    ).toBe(true);
  });

  test.each([
    ["workspace browser view", fakeWebContents(), trustedURL, true],
    ["external renderer URL", null, "https://external.test/app", true],
    ["trusted subframe", null, trustedURL, false],
  ])("denies audio from a %s", (_label, otherWebContents, requestingUrl, isMainFrame) => {
    const main = fakeWebContents();
    const policy = new MainRendererMicrophonePermissionPolicy(trustedURL, main);
    const webContents = otherWebContents ?? main;

    expect(
      policy.check(webContents, "media", new URL(requestingUrl).origin, {
        isMainFrame,
        mediaType: "audio",
        requestingUrl,
      }),
    ).toBe(false);
    expect(
      policy.request(webContents, "media", {
        isMainFrame,
        mediaTypes: ["audio"],
        requestingUrl,
      }),
    ).toBe(false);
  });

  test("denies a permission check without recognized web contents", () => {
    const policy = new MainRendererMicrophonePermissionPolicy(trustedURL, fakeWebContents());

    expect(
      policy.check(null, "media", "https://setta.test", {
        isMainFrame: true,
        mediaType: "audio",
        requestingUrl: trustedURL,
      }),
    ).toBe(false);
  });

  test("denies video, combined media, unknown media, and non-media permissions", () => {
    const main = fakeWebContents();
    const policy = new MainRendererMicrophonePermissionPolicy(trustedURL, main);
    const requestDetails = { isMainFrame: true, requestingUrl: trustedURL };

    expect(
      policy.check(main, "media", "https://setta.test", {
        ...requestDetails,
        mediaType: "video",
      }),
    ).toBe(false);
    expect(
      policy.check(main, "media", "https://setta.test", {
        ...requestDetails,
        mediaType: "unknown",
      }),
    ).toBe(false);
    expect(policy.request(main, "media", { ...requestDetails, mediaTypes: ["video"] })).toBe(false);
    expect(
      policy.request(main, "media", { ...requestDetails, mediaTypes: ["audio", "video"] }),
    ).toBe(false);
    expect(policy.request(main, "media", requestDetails)).toBe(false);
    expect(policy.request(main, "notifications", requestDetails)).toBe(false);
  });

  test("denies mismatched or malformed security origins", () => {
    const main = fakeWebContents();
    const policy = new MainRendererMicrophonePermissionPolicy(trustedURL, main);

    for (const origin of ["https://external.test", "not a URL"]) {
      expect(
        policy.check(main, "media", origin, {
          isMainFrame: true,
          mediaType: "audio",
          requestingUrl: trustedURL,
        }),
      ).toBe(false);
      expect(
        policy.request(main, "media", {
          isMainFrame: true,
          mediaTypes: ["audio"],
          requestingUrl: trustedURL,
          securityOrigin: origin,
        }),
      ).toBe(false);
    }
  });

  test("allows only the exact configured file renderer document", () => {
    const main = fakeWebContents();
    const fileURL = "file:///Applications/Setta/renderer/index.html?workspace=one";
    const policy = new MainRendererMicrophonePermissionPolicy(fileURL, main);

    expect(
      policy.check(main, "media", "file://", {
        isMainFrame: true,
        mediaType: "audio",
        requestingUrl: fileURL + "#focus",
        securityOrigin: "null",
      }),
    ).toBe(true);
    expect(
      policy.request(main, "media", {
        isMainFrame: true,
        mediaTypes: ["audio"],
        requestingUrl: "file:///Applications/Setta/renderer/other.html?workspace=one",
      }),
    ).toBe(false);
  });

  test("rejects unsupported trusted renderer URL schemes", () => {
    expect(
      () =>
        new MainRendererMicrophonePermissionPolicy("data:text/html,untrusted", fakeWebContents()),
    ).toThrow("trusted renderer URL must use file, http, or https");
  });
});

test("configures both Electron permission handlers with deny-by-default behavior", () => {
  const session = new FakePermissionSession();
  const main = fakeWebContents();
  configureMainRendererMicrophonePermissions({
    session,
    trustedRendererURL: trustedURL,
    trustedWebContents: main,
  });

  expect(session.checkHandler).not.toBeNull();
  expect(session.requestHandler).not.toBeNull();
  expect(
    session.checkHandler?.(main, "geolocation", "https://setta.test", {
      isMainFrame: true,
      requestingUrl: trustedURL,
    }),
  ).toBe(false);
  const callback = vi.fn();
  session.requestHandler?.(main, "media", callback, {
    isMainFrame: true,
    mediaTypes: ["video"],
    requestingUrl: trustedURL,
  });
  expect(callback).toHaveBeenCalledWith(false);
});

type PermissionCheckHandler = NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>;
type PermissionRequestHandler = NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;

class FakePermissionSession {
  checkHandler: PermissionCheckHandler | null = null;
  requestHandler: PermissionRequestHandler | null = null;

  setPermissionCheckHandler(handler: PermissionCheckHandler | null): void {
    this.checkHandler = handler;
  }

  setPermissionRequestHandler(handler: PermissionRequestHandler | null): void {
    this.requestHandler = handler;
  }
}

function fakeWebContents(): WebContents {
  return {} as WebContents;
}
