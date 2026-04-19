import { expect, test } from "@playwright/test";

test("python language-server banner warns when Python is still applied after selection is cleared", async ({
  page,
}) => {
  await page.route("**/api/plugins/runtime", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.status.plugins = [
      {
        pluginId: "setta-basedpyright",
        name: "Setta basedpyright",
        version: "0.1.0",
        state: "active",
        sourceScope: "workspace",
        sourceScopeLabel: "workspace",
        sourceManager: "setta",
        sourceManagerHint: null,
        sourcePath: "/tmp/setta-basedpyright",
        canonicalSourceKey: "local:/tmp/setta-basedpyright",
        sourceDigestSha256: null,
        shadowedBySourcePath: null,
        requestedCapabilities: ["registerLanguageServer"],
        effectiveCapabilities: ["registerLanguageServer"],
        blockedCapabilities: [],
        registeredCodegenTargets: [],
        registeredLanguageServers: [
          {
            pluginId: "setta-basedpyright",
            name: "basedpyright",
            language: "python",
            command: "/bin/python",
            args: ["-c", "from basedpyright.langserver import main; main()"],
            settingsKey: "basedpyright",
          },
        ],
        appliedLanguageServerLanguages: ["python"],
        registeredBackendRoutes: [],
        registeredStaticDirs: [],
        registeredListenerEndpoints: [],
        enablementSource: "workspace_enabled",
        restartRequired: false,
        runtimePayloadDigestSha256: "digest",
        errors: [],
      },
    ];
    await route.fulfill({ response, json: payload });
  });

  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-titlebar-offset");
  await expect(page.getByTestId("home-file-manager-layout")).toBeVisible();
  await page.evaluate(async () => {
    const runtime = await import("/src/plugins/runtime.ts");
    await runtime.refreshPluginRuntime();
  });

  await page.evaluate(async () => {
    const definitions = await import("/src/state/definitions.ts");
    const current = definitions.useSettings.getState();
    definitions.useSettings.setState({
      ...current,
      languageServer: {
        ...current.languageServer,
        selectedByLanguage: {
          ...current.languageServer.selectedByLanguage,
          python: null,
        },
      },
    });
  });

  await expect(
    page.getByTestId("python-language-server-status-banner"),
  ).toContainText(
    'Python language server is still applied by "setta-basedpyright". Restart is still required before it is turned off.',
  );
});
