import { expect, test } from "@playwright/test";
import { cleanupIsolatedProject, openIsolatedProject } from "../../helpers";

test("core frontend connects through the Go websocket route", async ({
  page,
}) => {
  const websocketUrls: string[] = [];
  page.on("websocket", (websocket) => {
    websocketUrls.push(websocket.url());
  });

  const projectContext = await openIsolatedProject(page);

  try {
    await expect
      .poll(() => {
        return (
          websocketUrls.find((url) => url.includes("/ws/frontend")) ?? null
        );
      })
      .not.toBeNull();

    expect(
      websocketUrls.some(
        (url) =>
          url.includes("/api/frontend") || url.includes("/share/frontend"),
      ),
    ).toBe(false);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
