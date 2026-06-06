export async function runCodexAccountWorkflow({
  backend,
  clickButtonByAria,
  client,
  waitForText,
  waitForTexts,
}) {
  await clickButtonByAria(client, "Open settings");
  await waitForText(client, "Codex Account");
  await clickSettingsTab(client, "Codex Account");
  await waitForText(client, "Signed out");
  await clickButtonBySelector(client, '[data-testid="codex-account-login"]');
  await waitForTexts(client, ["Signed in", "user@example.com · ChatGPT pro"]);

  const signedIn = await backend.get("/codex/account");
  assertSignedIn(signedIn);

  await clickButtonBySelector(client, '[data-testid="codex-account-logout"]');
  await waitForTexts(client, ["Signed out", "Codex is not signed in"]);

  const signedOut = await backend.get("/codex/account");
  assertSignedOut(signedOut);
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

async function clickSettingsTab(client, label) {
  const clicked = await client.evaluate(`(() => {
    const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
    const tab = tabs.find((candidate) => candidate.innerText.trim() === ${JSON.stringify(label)});
    if (!(tab instanceof HTMLButtonElement) || tab.disabled) {
      return false;
    }
    tab.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`settings tab was not clickable: ${label}`);
  }
}
