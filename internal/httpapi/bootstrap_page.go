package httpapi

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

const (
	bootstrapPagePath        = "/__setta__/bootstrap"
	bootstrapConsumePath     = "/__setta__/bootstrap/consume"
	backendOriginQueryParam  = "__setta_backend_origin"
	defaultDevFrontendScheme = "http"
	devFrontendPortEnv       = "SETTA_DEV_FRONTEND_PORT"
	devFrontendSchemeEnv     = "SETTA_DEV_FRONTEND_SCHEME"
)

const RouteBootstrapPage = bootstrapPagePath
const RouteBootstrapConsume = bootstrapConsumePath

const bootstrapPageHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Setta Bootstrap</title>
    <script>
      (function () {
        try {
          const stored = localStorage.getItem("setta_data");
          if (!stored) {
            return;
          }
          const parsed = JSON.parse(stored);
          if (parsed && parsed.state && parsed.state.darkMode) {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
        } catch {
        }
      })();
    </script>
    <style>
      :root {
        --app-shell-bg: linear-gradient(
          135deg,
          hsl(222, 28%, 95%),
          hsl(219, 24%, 89%),
          hsl(219, 25%, 77%)
        );
        --text-base: hsl(219, 25%, 34%);
        --text-accent: hsl(220, 25%, 45%);
        --text-muted: hsl(220, 25%, 57%);
        --spinner-color: rgba(87, 110, 148, 0.7);
        --panel-border: rgba(15, 23, 42, 0.08);
        --panel-bg: rgba(255, 255, 255, 0.55);
        --input-bg: rgba(255, 255, 255, 0.75);
        --input-border: hsl(219, 25%, 77%);
        --input-focus: #3b82f6;
        --button-bg: rgba(255, 255, 255, 0.7);
        --button-border: rgba(15, 23, 42, 0.12);
        --button-text: hsl(219, 25%, 34%);
        --button-hover: rgba(255, 255, 255, 0.9);
        --code-bg: rgba(255, 255, 255, 0.65);
        --error: #ef4444;
      }

      html.dark {
        --app-shell-bg: linear-gradient(
          135deg,
          hsl(220, 27%, 6%),
          hsl(220, 24%, 4.5%),
          hsl(220, 25%, 3%)
        );
        --text-base: hsl(219, 24%, 89%);
        --text-accent: hsl(219, 25%, 77%);
        --text-muted: hsl(220, 25%, 57%);
        --spinner-color: hsl(219, 25%, 34%);
        --panel-border: rgba(148, 163, 184, 0.12);
        --panel-bg: rgba(8, 12, 20, 0.65);
        --input-bg: rgba(10, 15, 24, 0.8);
        --input-border: rgba(148, 163, 184, 0.2);
        --input-focus: #60a5fa;
        --button-bg: rgba(8, 12, 20, 0.7);
        --button-border: rgba(148, 163, 184, 0.18);
        --button-text: hsl(219, 24%, 89%);
        --button-hover: rgba(8, 12, 20, 0.9);
        --code-bg: rgba(8, 12, 20, 0.7);
        --error: #f87171;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --app-shell-bg: linear-gradient(
            135deg,
            hsl(220, 27%, 6%),
            hsl(220, 24%, 4.5%),
            hsl(220, 25%, 3%)
          );
          --text-base: hsl(219, 24%, 89%);
          --text-accent: hsl(219, 25%, 77%);
          --text-muted: hsl(220, 25%, 57%);
          --spinner-color: hsl(219, 25%, 34%);
          --panel-border: rgba(148, 163, 184, 0.12);
          --panel-bg: rgba(8, 12, 20, 0.65);
          --input-bg: rgba(10, 15, 24, 0.8);
          --input-border: rgba(148, 163, 184, 0.2);
          --input-focus: #60a5fa;
          --button-bg: rgba(8, 12, 20, 0.7);
          --button-border: rgba(148, 163, 184, 0.18);
          --button-text: hsl(219, 24%, 89%);
          --button-hover: rgba(8, 12, 20, 0.9);
          --code-bg: rgba(8, 12, 20, 0.7);
          --error: #f87171;
        }
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        height: 100%;
      }

      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
          "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans",
          "Helvetica Neue", sans-serif;
        color: var(--text-base);
        background-image: var(--app-shell-bg);
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 24px;
      }

      main {
        width: 100%;
        max-width: 640px;
      }

      .panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        text-align: center;
        padding: 28px 24px;
        border-radius: 24px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
        backdrop-filter: blur(10px);
      }

      .spinner {
        height: 48px;
        width: 48px;
        border-radius: 999px;
        border: 2px solid var(--spinner-color);
        border-top-color: transparent;
        animation: spin 1s linear infinite;
      }

      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--text-accent);
      }

      .status {
        color: var(--text-accent);
        font-size: 12px;
        line-height: 1.4;
      }

      .status p {
        margin: 0;
      }

      .error {
        min-height: 16px;
        font-size: 12px;
        color: var(--error);
      }

      .form {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      label {
        text-align: left;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .input-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      input {
        flex: 1 1 320px;
        border-radius: 12px;
        border: 1px solid var(--input-border);
        background: var(--input-bg);
        padding: 10px 12px;
        font-size: 14px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        color: var(--text-base);
      }

      input:focus {
        outline: 2px solid var(--input-focus);
        border-color: transparent;
      }

      button {
        border-radius: 999px;
        border: 1px solid var(--button-border);
        background: var(--button-bg);
        color: var(--button-text);
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-weight: 600;
        padding: 10px 16px;
        cursor: pointer;
      }

      button:hover {
        background: var(--button-hover);
      }

      .hint {
        margin: 0;
        font-size: 11px;
        color: var(--text-muted);
        line-height: 1.4;
      }

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        background: var(--code-bg);
        border-radius: 6px;
        padding: 2px 6px;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 520px) {
        .panel {
          padding: 24px 18px;
        }

        .input-row {
          flex-direction: column;
        }

        button {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <div class="spinner"></div>
        <div class="eyebrow">Preparing setta</div>
        <div class="status">
          <p id="status">Paste a bootstrap token to continue.</p>
        </div>
        <div class="error" id="error"></div>
        <form id="bootstrap-form" class="form">
          <label for="token-input">Bootstrap token</label>
          <div class="input-row">
            <input
              id="token-input"
              type="text"
              autocomplete="off"
              placeholder="Paste token"
            />
            <button type="submit">Connect</button>
          </div>
        </form>
        <p class="hint">
          Tip: open <code>/__setta__/bootstrap#token=...</code> to skip manual
          entry.
        </p>
      </section>
    </main>
    <script>
      (function () {
        const redirectUrl = __SETTA_REDIRECT_URL__;
        const consumeUrl = __SETTA_CONSUME_URL__;
        const bootstrapPagePath = __SETTA_BOOTSTRAP_PAGE_PATH__;
        const workspaceHistoryHandoffKey = "setta.workspaceHistoryHandoff";
        const launcherOriginKey = "setta.launcherOrigin";
        const openWorkspaceSwitcherQueryParam = "__setta_open_workspace_switcher";
        const launcherOriginStorage = sessionStorage;
        const maxHandoffLength = 8192;
        const form = document.getElementById("bootstrap-form");
        const input = document.getElementById("token-input");
        const statusEl = document.getElementById("status");
        const errorEl = document.getElementById("error");

        function setStatus(message) {
          statusEl.textContent = message;
        }

        function setError(message) {
          errorEl.textContent = message || "";
        }

        let hashParams;
        try {
          const hash = window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash;
          hashParams = new URLSearchParams(hash || "");
        } catch {
          hashParams = new URLSearchParams();
        }

        function hydrateWorkspaceHistoryFromHash() {
          try {
            const encoded = hashParams.get("wh");
            if (!encoded) {
              return;
            }
            const trimmed = encoded.trim();
            if (!trimmed || trimmed.length > maxHandoffLength) {
              return;
            }
            localStorage.setItem(workspaceHistoryHandoffKey, trimmed);
          } catch {
          }
        }

        function readLauncherOriginHandoffFromHash() {
          try {
            const rawOrigin = hashParams.get("lo");
            const rawProof = hashParams.get("lop");
            if (!rawOrigin || !rawProof) {
              return null;
            }
            const normalizedOrigin = rawOrigin.trim();
            const normalizedProof = rawProof.trim();
            if (
              !normalizedOrigin ||
              !normalizedProof ||
              normalizedOrigin.length > maxHandoffLength ||
              normalizedProof.length > maxHandoffLength
            ) {
              return null;
            }
            return {
              origin: normalizedOrigin,
              proof: normalizedProof,
            };
          } catch {
            return null;
          }
        }

        function persistLauncherOrigin(launcherOrigin) {
          try {
            if (typeof launcherOrigin !== "string") {
              launcherOriginStorage.removeItem(launcherOriginKey);
              return;
            }
            const trimmed = launcherOrigin.trim();
            if (!trimmed || trimmed.length > maxHandoffLength) {
              launcherOriginStorage.removeItem(launcherOriginKey);
              return;
            }
            launcherOriginStorage.setItem(launcherOriginKey, trimmed);
          } catch {
          }
        }

        function shouldOpenWorkspaceSwitcherFromHash() {
          try {
            const raw = hashParams.get("osw");
            if (!raw) {
              return false;
            }
            const normalized = raw.trim().toLowerCase();
            return normalized === "1" || normalized === "true";
          } catch {
            return false;
          }
        }

        function readTokenFromUrl() {
          const hashToken = hashParams.get("token");
          if (hashToken) {
            return hashToken;
          }
          return new URLSearchParams(window.location.search).get("token");
        }

        async function consumeToken(token) {
          setError("");
          setStatus("Setting auth cookie...");
          const launcherOriginHandoff = readLauncherOriginHandoffFromHash();
          const consumeBody = { token: token };
          if (launcherOriginHandoff) {
            consumeBody.launcherOrigin = launcherOriginHandoff.origin;
            consumeBody.launcherOriginProof = launcherOriginHandoff.proof;
          }
          const response = await fetch(consumeUrl, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(consumeBody),
          });
          if (!response.ok) {
            throw new Error("Token rejected. Request a new token and try again.");
          }
          let consumePayload = null;
          try {
            consumePayload = await response.json();
          } catch {
            consumePayload = null;
          }
          hydrateWorkspaceHistoryFromHash();
          persistLauncherOrigin(
            consumePayload &&
              typeof consumePayload.launcherOrigin === "string"
              ? consumePayload.launcherOrigin
              : null,
          );
          let nextRedirectUrl = redirectUrl;
          if (shouldOpenWorkspaceSwitcherFromHash()) {
            try {
              const redirect = new URL(redirectUrl, window.location.href);
              redirect.searchParams.set(openWorkspaceSwitcherQueryParam, "1");
              nextRedirectUrl = redirect.toString();
            } catch {
            }
          }
          try {
            history.replaceState({}, "", bootstrapPagePath);
          } catch {
            history.replaceState(null, "", bootstrapPagePath);
          }
          window.location.assign(nextRedirectUrl);
        }

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const token = input.value.trim();
          if (!token) {
            setError("Paste a bootstrap token first.");
            return;
          }
          consumeToken(token).catch(function (error) {
            setError(error instanceof Error ? error.message : "Token rejected. Request a new token and try again.");
            setStatus("Paste a bootstrap token to continue.");
          });
        });

        const urlToken = readTokenFromUrl();
        if (urlToken) {
          input.value = urlToken;
          consumeToken(urlToken).catch(function (error) {
            setError(error instanceof Error ? error.message : "Token rejected. Request a new token and try again.");
            setStatus("Paste a bootstrap token to continue.");
          });
        }
      })();
    </script>
  </body>
</html>
`

func bootstrapPageHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		redirectURL := resolveBootstrapRedirectURL(r)
		redirectJSON, _ := json.Marshal(redirectURL)
		consumeJSON, _ := json.Marshal(bootstrapConsumePath)
		pagePathJSON, _ := json.Marshal(bootstrapPagePath)

		html := strings.NewReplacer(
			"__SETTA_REDIRECT_URL__", string(redirectJSON),
			"__SETTA_CONSUME_URL__", string(consumeJSON),
			"__SETTA_BOOTSTRAP_PAGE_PATH__", string(pagePathJSON),
		).Replace(bootstrapPageHTMLTemplate)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(html))
	}
}

func resolveBootstrapRedirectURL(r *http.Request) string {
	devFrontendPort := strings.TrimSpace(os.Getenv(devFrontendPortEnv))
	if devFrontendPort == "" {
		return "/"
	}
	scheme := strings.TrimSpace(strings.ToLower(os.Getenv(devFrontendSchemeEnv)))
	if scheme == "" {
		scheme = defaultDevFrontendScheme
	}
	if scheme != "http" && scheme != "https" {
		scheme = defaultDevFrontendScheme
	}

	host := r.URL.Hostname()
	if host == "" {
		host = requestHostname(r)
	}
	if host == "" {
		host = "127.0.0.1"
	}
	devHost := formatHostForURL(host)

	redirectURL := scheme + "://" + devHost + ":" + devFrontendPort + "/"
	backendOrigin := requestOrigin(r)
	if backendOrigin == "" {
		return redirectURL
	}

	parsed, err := url.Parse(redirectURL)
	if err != nil {
		return redirectURL
	}
	query := parsed.Query()
	query.Set(backendOriginQueryParam, backendOrigin)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func requestOrigin(r *http.Request) string {
	if r == nil {
		return ""
	}
	host := requestHost(r)
	if host == "" {
		return ""
	}
	scheme := "http"
	if r.URL != nil && strings.TrimSpace(r.URL.Scheme) != "" {
		scheme = strings.TrimSpace(r.URL.Scheme)
	} else if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + host
}

func requestHost(r *http.Request) string {
	if r == nil {
		return ""
	}
	if strings.TrimSpace(r.Host) != "" {
		return r.Host
	}
	if r.URL != nil {
		return strings.TrimSpace(r.URL.Host)
	}
	return ""
}

func requestHostname(r *http.Request) string {
	host := requestHost(r)
	if host == "" {
		return ""
	}
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		return parsedHost
	}
	return host
}

func formatHostForURL(host string) string {
	if host == "0.0.0.0" {
		host = "127.0.0.1"
	} else if host == "::" {
		host = "::1"
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		return "[" + host + "]"
	}
	return host
}
