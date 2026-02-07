import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { ensureAppReady } from "../helpers";

type AppSpecPayload = {
  root: string;
  elements: Record<string, Record<string, unknown>>;
};

type AppRoute = {
  path: string;
  name?: string | null;
  rootKey?: string | null;
};

async function renderAppPageMarkup(
  page: Page,
  {
    path,
    appSpec,
    routes,
    expectedText,
  }: { path: string; appSpec: AppSpecPayload; routes: AppRoute[]; expectedText: string },
) {
  return page.evaluate(
    async ({ path, appSpec, routes, expectedText }) => {
      const {
        useAppDefinition,
        useShareSession,
      } = await import("/src/state/definitions.ts");
      const { resetProjectStores } = await import("/src/state/utils.ts");

      resetProjectStores();
      useShareSession.setState({
        isShareMode: false,
        shareSessionId: null,
        sharePolicy: null,
        shareDeploymentName: null,
        shareDeploymentVersion: null,
        deploymentMode: null,
      });

      useAppDefinition.setState({
        appDefinition: {
          appSpecVersion: "v1",
          catalogId: "setta.app.default",
          appSpecPath: null,
          routes,
          dataBindings: {},
          actions: {},
          theme: null,
          assets: [],
        },
        appSpec,
      });

      if (useAppDefinition.getInitialState) {
        const initial = useAppDefinition.getInitialState();
        Object.assign(initial, useAppDefinition.getState());
      }

      const {
        React,
        MemoryRouter,
        createRoot,
      } = await import("/src/testUtils/appRouteTestUtils.ts");
      const { AppPage } = await import(
        "/src/components/Pages/App/AppPage.tsx"
      );

      const container = document.createElement("div");
      container.dataset.testid = "app-route-render";
      document.body.appendChild(container);

      const root = createRoot(container);
      try {
        root.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: [path] },
            React.createElement(AppPage),
          ),
        );
        for (let attempt = 0; attempt < 100; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          const html = container.innerHTML;
          if (html && html.includes(expectedText)) {
            return html;
          }
        }
        return container.innerHTML;
      } finally {
        root.unmount();
        container.remove();
      }
    },
    { path, appSpec, routes, expectedText },
  );
}

test("app routes select the configured UI root", async ({ page }) => {
  await ensureAppReady(page);
  await page.waitForLoadState("domcontentloaded");

  const appSpec: AppSpecPayload = {
    root: "alpha-root",
    elements: {
      "alpha-root": {
        key: "alpha-root",
        type: "Stack",
        children: ["alpha-text"],
      },
      "alpha-text": {
        key: "alpha-text",
        type: "Text",
        props: { text: "Alpha view" },
      },
      "beta-root": {
        key: "beta-root",
        type: "Stack",
        children: ["beta-text"],
      },
      "beta-text": {
        key: "beta-text",
        type: "Text",
        props: { text: "Beta view" },
      },
    },
  };

  const routes: AppRoute[] = [
    { path: "/alpha", name: "Alpha", rootKey: "alpha-root" },
    { path: "/beta", name: "Beta", rootKey: "beta-root" },
  ];

  const alphaMarkup = await renderAppPageMarkup(page, {
    path: "/alpha",
    appSpec,
    routes,
    expectedText: "Alpha view",
  });
  expect(alphaMarkup).toContain("Alpha view");
  expect(alphaMarkup).not.toContain("Beta view");

  const betaMarkup = await renderAppPageMarkup(page, {
    path: "/beta",
    appSpec,
    routes,
    expectedText: "Beta view",
  });
  expect(betaMarkup).toContain("Beta view");
  expect(betaMarkup).not.toContain("Alpha view");
});
