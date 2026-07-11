/* global process, require */

// Electron loads this directory as a CommonJS app entry. The import must be
// synchronous because Chromium command-line switches are immutable after ready.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { app, BrowserWindow, session } = require("electron");

const targetURL = process.env.SETTA_E2E_WEB_PWA_URL;
if (!targetURL) {
  throw new Error("SETTA_E2E_WEB_PWA_URL is required");
}

const secureHostname = "setta-secure.test";
app.commandLine.appendSwitch(
  "host-resolver-rules",
  "MAP setta-insecure.test 127.0.0.1, MAP setta-secure.test 127.0.0.1",
);
app.commandLine.appendSwitch("no-proxy-server");
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");

void app.whenReady().then(async () => {
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    callback(request.hostname === secureHostname ? 0 : -3);
  });

  const window = new BrowserWindow({
    height: 915,
    show: process.env.SETTA_E2E_VISIBLE === "1",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 412,
  });
  window.webContents.setUserAgent(
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/136.0 Mobile Safari/537.36",
  );
  await window.loadURL(targetURL);
});

app.on("window-all-closed", () => app.quit());
