export async function runCodexAccountWorkflow({
  backend,
  clickButtonByAria,
  client,
  waitForText,
  waitForTexts,
}) {
  await clickButtonByAria(client, "Open settings");
  await waitForText(client, "Codex Account");
  await clickButtonBySelector(client, "#settings-subtab-codex-account");
  await waitForText(client, "Signed out");
  await clickButtonBySelector(client, '[data-testid="codex-account-login"]');
  await waitForTexts(client, ["Signed in", "user@example.com · ChatGPT pro"]);

  const signedIn = await backend.get("/codex/account");
  assertSignedIn(signedIn);

  await clickButtonBySelector(client, '[data-testid="codex-account-logout"]');
  await waitForTexts(client, ["Signed out", "Codex is not signed in"]);

  const signedOut = await backend.get("/codex/account");
  assertSignedOut(signedOut);
  await clickButtonByText(client, "Back to panes");
  await waitForSettingsShellClosed(client);
}

function assertSignedIn(account) {
  if (
    account.status !== "signed_in" ||
    account.account?.type !== "chatgpt" ||
    account.account?.email !== "user@example.com" ||
    account.account?.planType !== "pro"
  ) {
    throw new Error(`Codex account was not signed in: ${JSON.stringify(account)}`);
  }
}

function assertSignedOut(account) {
  if (account.status !== "unauthenticated" || account.account !== null) {
    throw new Error(`Codex account was not signed out: ${JSON.stringify(account)}`);
  }
}

async function clickButtonBySelector(client, selector) {
  const clicked = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLButtonElement) || element.disabled) {
      return false;
    }
    element.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`button was not clickable: ${selector}`);
  }
}

async function clickButtonByText(client, text) {
  const clicked = await client.evaluate(`(() => {
    const element = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)},
    );
    if (!(element instanceof HTMLButtonElement) || element.disabled) {
      return false;
    }
    element.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`button was not clickable: ${text}`);
  }
}

async function waitForSettingsShellClosed(client) {
  await client.evaluate(`new Promise((resolve, reject) => {
    const ready = () => !document.querySelector('[data-testid="settings-shell-page"]');
    if (ready()) {
      resolve(true);
      return;
    }
    const startedAt = performance.now();
    const tick = () => {
      if (ready()) {
        resolve(true);
        return;
      }
      if (performance.now() - startedAt > 5000) {
        reject(new Error("Settings shell did not close"));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  })`);
}
