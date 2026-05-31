export async function runProviderAccountWorkflow({
  backend,
  clickButtonByAria,
  client,
  setInputValue,
  waitForText,
  waitForTexts,
}) {
  await clickButtonByAria(client, "Open settings");
  await waitForText(client, "Provider Accounts");
  await clickButtonBySelector(client, '[data-testid="provider-account-configure"]');
  await setInputValue(client, '[data-testid="provider-account-access-token"]', "access_token_e2e");
  await setInputValue(client, '[data-testid="provider-account-account-id"]', "account_e2e");
  await setSelectValue(client, '[data-testid="provider-account-plan-type"]', "pro");
  await clickButtonBySelector(client, '[data-testid="provider-account-save"]');
  await waitForTexts(client, ["Configured", "account_e2e pro"]);
  const configured = await backend.get("/provider-accounts");
  const account = configured.accounts.find(
    (candidate) => candidate.provider === "codex" && candidate.authMode === "chatgpt",
  );
  if (!account?.configured || account.accountId !== "account_e2e") {
    throw new Error(`provider account was not configured: ${JSON.stringify(configured)}`);
  }
  await clickButtonBySelector(client, '[data-testid="provider-account-clear"]');
  await waitForTexts(client, ["Empty", "ChatGPT auth is not configured"]);
  const cleared = await backend.get("/provider-accounts");
  const clearedAccount = cleared.accounts.find(
    (candidate) => candidate.provider === "codex" && candidate.authMode === "chatgpt",
  );
  if (clearedAccount?.configured) {
    throw new Error(`provider account was not cleared: ${JSON.stringify(cleared)}`);
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

async function setSelectValue(client, selector, value) {
  const changed = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLSelectElement) || element.disabled) {
      return false;
    }
    element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value === ${JSON.stringify(value)};
  })()`);
  if (!changed) {
    throw new Error(`select was not editable: ${selector}`);
  }
}
