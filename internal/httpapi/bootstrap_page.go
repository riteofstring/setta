package httpapi

import (
	"encoding/json"
	"fmt"
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
	defaultDevFrontendPort   = "3000"
	defaultDevFrontendScheme = "http"
	devFrontendPortEnv       = "SETTA_DEV_FRONTEND_PORT"
	devFrontendSchemeEnv     = "SETTA_DEV_FRONTEND_SCHEME"
)

func bootstrapPageHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		redirectURL := resolveBootstrapRedirectURL(r)
		redirectJSON, _ := json.Marshal(redirectURL)
		consumeJSON, _ := json.Marshal(bootstrapConsumePath)
		pagePathJSON, _ := json.Marshal(bootstrapPagePath)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintf(w, `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Setta Bootstrap</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f6f7fb;
        --panel: rgba(255, 255, 255, 0.9);
        --text: #0f172a;
        --muted: #475569;
        --border: rgba(15, 23, 42, 0.12);
        --accent: #2563eb;
        --error: #dc2626;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #020617;
          --panel: rgba(15, 23, 42, 0.9);
          --text: #e2e8f0;
          --muted: #94a3b8;
          --border: rgba(148, 163, 184, 0.18);
          --accent: #60a5fa;
          --error: #f87171;
        }
      }
      * { box-sizing: border-box; }
      html, body { height: 100%%; }
      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, rgba(37, 99, 235, 0.12), transparent 42%%), var(--bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      main {
        width: min(100%%, 460px);
        border: 1px solid var(--border);
        border-radius: 18px;
        background: var(--panel);
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 20px;
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }
      form {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }
      input {
        width: 100%%;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: transparent;
        color: inherit;
        padding: 12px 14px;
        font: inherit;
      }
      button {
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        padding: 12px 16px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .meta {
        margin-top: 14px;
        min-height: 20px;
        color: var(--muted);
        font-size: 13px;
      }
      .error {
        color: var(--error);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Setta Bootstrap</h1>
      <p>Paste a bootstrap token or open this page with <code>#token=...</code>.</p>
      <form id="bootstrap-form">
        <input id="token-input" type="text" autocomplete="off" placeholder="Bootstrap token" />
        <button type="submit">Connect</button>
      </form>
      <div id="meta" class="meta"></div>
    </main>
    <script>
      const redirectUrl = %s;
      const consumeUrl = %s;
      const bootstrapPagePath = %s;
      const form = document.getElementById("bootstrap-form");
      const tokenInput = document.getElementById("token-input");
      const meta = document.getElementById("meta");

      function setMessage(message, isError) {
        meta.textContent = message;
        meta.className = isError ? "meta error" : "meta";
      }

      function readHashParams() {
        const rawHash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        return new URLSearchParams(rawHash);
      }

      async function consumeToken(token) {
        const hashParams = readHashParams();
        const payload = { token };
        const launcherOrigin = hashParams.get("lo");
        const launcherOriginProof = hashParams.get("lop");
        if (launcherOrigin) {
          payload.launcherOrigin = launcherOrigin;
        }
        if (launcherOriginProof) {
          payload.launcherOriginProof = launcherOriginProof;
        }

        setMessage("Connecting...", false);
        const response = await fetch(consumeUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error("Invalid or expired bootstrap token.");
        }
        try {
          window.history.replaceState({}, "", bootstrapPagePath);
        } catch {
          window.history.replaceState(null, "", bootstrapPagePath);
        }
        window.location.assign(redirectUrl);
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const token = tokenInput.value.trim();
        if (!token) {
          setMessage("Paste a bootstrap token first.", true);
          return;
        }
        void consumeToken(token).catch((error) => {
          setMessage(error instanceof Error ? error.message : "Bootstrap failed.", true);
        });
      });

      const initialToken = readHashParams().get("token");
      if (initialToken) {
        tokenInput.value = initialToken;
        void consumeToken(initialToken).catch((error) => {
          setMessage(error instanceof Error ? error.message : "Bootstrap failed.", true);
        });
      } else {
        setMessage("Paste a bootstrap token to continue.", false);
      }
    </script>
  </body>
</html>`, redirectJSON, consumeJSON, pagePathJSON)
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

	redirectURL := fmt.Sprintf("%s://%s:%s/", scheme, devHost, devFrontendPort)
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
	return fmt.Sprintf("%s://%s", scheme, host)
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
