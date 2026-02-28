import { expect, test } from "@playwright/test";

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
