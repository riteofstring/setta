import type { BrowserContext, Page } from "@playwright/test";

const SETTA_AUTH_COOKIE_PREFIX = "setta_auth_";

export function matchesExpectedProjectUrl(
  candidateUrl: string,
  expectedProjectUrl: URL,
): boolean {
  const parsedCandidateUrl = new URL(candidateUrl);
  const expectedPathname = expectedProjectUrl.pathname;
  return (
    parsedCandidateUrl.origin === expectedProjectUrl.origin &&
    (parsedCandidateUrl.pathname === expectedPathname ||
      (expectedPathname === "/" && parsedCandidateUrl.pathname === "/home"))
  );
}

export async function waitForAuthenticatedShellReady({
  context,
  expectedProjectUrl,
  page,
  timeoutMs,
}: {
  context: BrowserContext;
  expectedProjectUrl: URL;
  page: Page;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (matchesExpectedProjectUrl(page.url(), expectedProjectUrl)) {
      if (
        (await page.locator(".setta-titlebar-offset").count()) > 0 ||
        (await hasSettaAuthCookie(context))
      ) {
        return;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Timed out waiting for authenticated shell readiness. Current URL: ${page.url()}`,
  );
}

async function hasSettaAuthCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies();
  return cookies.some((cookie) =>
    cookie.name.startsWith(SETTA_AUTH_COOKIE_PREFIX),
  );
}
