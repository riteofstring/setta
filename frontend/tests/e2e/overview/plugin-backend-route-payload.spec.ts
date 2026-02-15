import { expect, test } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BACKEND_ROUTE_QUERY_PATH =
  "/api/plugins/setta-fixture-backend-language-server-e2e/payload/echo-query";

test("plugin backend route proxy preserves query and json body payloads", async ({
  page,
}) => {
  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  try {
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expect(
      page.getByRole("heading", {
        name: "setta-fixture-backend-language-server-e2e@0.1.0",
        exact: true,
      }),
    ).toBeVisible();

    let queryPayload: {
      status: number;
      body: {
        alpha: string;
        repeated: string[] | string | null;
        repeatedIsList: boolean;
      };
    } | null = null;
    allowExpectedApiError(page, {
      path: BACKEND_ROUTE_QUERY_PATH,
      statuses: [404],
      method: "GET",
      count: 100,
      ttlMs: 30000,
    });
    await expect
      .poll(async () => {
        queryPayload = (await page.evaluate(async (backendOrigin) => {
          const response = await fetch(
            `${backendOrigin}/api/plugins/setta-fixture-backend-language-server-e2e/payload/echo-query?alpha=one&repeated=a&repeated=b`,
            {
              credentials: "include",
            },
          );
          const body = await response.json();
          return {
            status: response.status,
            body,
          };
        }, BACKEND_ORIGIN)) as {
          status: number;
          body: {
            alpha: string;
            repeated: string[] | string | null;
            repeatedIsList: boolean;
          };
        };
        return queryPayload.status;
      })
      .toBe(200);
    if (!queryPayload) {
      throw new Error("Missing query payload response.");
    }
    expect(queryPayload.status).toBe(200);
    expect(queryPayload.body).toEqual({
      alpha: "one",
      repeated: ["a", "b"],
      repeatedIsList: true,
    });

    const requestBody = {
      value: "hello",
      count: 3,
      nested: {
        ok: true,
      },
    };
    const bodyPayload = (await page.evaluate(
      async ({ backendOrigin, payload }) => {
        const response = await fetch(
          `${backendOrigin}/api/plugins/setta-fixture-backend-language-server-e2e/payload/echo-body?token=from-query`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        const body = await response.json();
        return {
          status: response.status,
          body,
        };
      },
      {
        backendOrigin: BACKEND_ORIGIN,
        payload: requestBody,
      },
    )) as {
      status: number;
      body: {
        value: string;
        count: number;
        token: string;
        body: Record<string, unknown>;
      };
    };
    expect(bodyPayload.status).toBe(200);
    expect(bodyPayload.body).toEqual({
      value: "hello",
      count: 3,
      token: "from-query",
      body: requestBody,
    });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
