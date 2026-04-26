import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

test("launch endpoint rejects requests without launch intent token", async ({
  request,
}) => {
  const response = await request.post(`${BACKEND_ORIGIN}/api/launch`, {
    data: {
      workspaceRoot: "/tmp/workspace",
    },
  });

  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    ok: boolean;
    error?: {
      code?: string;
      message?: string;
    };
  };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("BadRequest");
  expect(payload.error?.message).toBe("launchIntentToken is required.");
});

test("create launch intent rejects missing workspace root", async ({ page }) => {
  await ensureAppReady(page);
  const returnUrl = page.url();

  const response = await page.evaluate(async (nextReturnUrl: string) => {
    const { createWorkspaceLaunchIntent } = await import("/src/openapi/http");
    const { callOpenAPI } = await import("/src/openapi/http/result");
    return await callOpenAPI(
      createWorkspaceLaunchIntent({
        body: {
          launchRequest: {},
          returnUrl: nextReturnUrl,
        },
      }),
    );
  }, returnUrl);

  expect(response.status).toBe(200);
  const payload = response.data as {
    ok?: boolean;
    error?: {
      code?: string;
      message?: string;
    };
  };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("BadRequest");
  expect(payload.error?.message).toContain("workspaceRoot");
});
