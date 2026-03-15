package llmconfig

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestLoadDefaultsToSettaServerWhenFileMissing(t *testing.T) {
	t.Parallel()

	configs, err := Load(
		filepath.Join(t.TempDir(), "llm_config.json"),
		LoadOptions{SettaServerURL: "http://127.0.0.1:8000/mcp"},
	)
	if err != nil {
		t.Fatalf("load llm config: %v", err)
	}

	server, ok := configs.MCPServers[DefaultServerID]
	if !ok {
		t.Fatal("expected default setta server")
	}
	if server.Transport != TransportSSE {
		t.Fatalf("expected sse transport, got %q", server.Transport)
	}
	if server.URL != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("unexpected setta server url %q", server.URL)
	}
}

func TestLoadDerivesConfigIDsAndResolvesServerSets(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, "llm_config.json")
	payload := `{
  "configs": {
    "primary": {
      "model": "gpt-4o-mini",
      "provider": "openai"
    },
    "isolated": {
      "model": "claude-sonnet",
      "provider": "anthropic",
      "mcpServerIds": []
    },
    "explicit": {
      "model": "gpt-4.1",
      "provider": "openai",
      "mcpServerIds": ["setta", "github"]
    }
  },
  "defaultMcpServerIds": ["github"],
  "mcpServers": {
    "setta": {
      "transport": "sse",
      "url": "http://127.0.0.1:9999/mcp"
    },
    "github": {
      "transport": "streamable_http",
      "url": "https://example.com/mcp"
    }
  }
}`
	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatalf("write llm config: %v", err)
	}

	configs, err := Load(path, LoadOptions{SettaServerURL: "http://127.0.0.1:8000/mcp"})
	if err != nil {
		t.Fatalf("load llm config: %v", err)
	}

	primary, err := configs.ResolveConfig("primary")
	if err != nil {
		t.Fatalf("resolve primary config: %v", err)
	}
	if primary.ID != "primary" {
		t.Fatalf("expected derived config id primary, got %q", primary.ID)
	}
	servers, err := configs.ResolveMCPServerIDs(primary)
	if err != nil {
		t.Fatalf("resolve primary server ids: %v", err)
	}
	if !reflect.DeepEqual(servers, []string{"github"}) {
		t.Fatalf("unexpected primary server ids %#v", servers)
	}

	isolated, err := configs.ResolveConfig("isolated")
	if err != nil {
		t.Fatalf("resolve isolated config: %v", err)
	}
	servers, err = configs.ResolveMCPServerIDs(isolated)
	if err != nil {
		t.Fatalf("resolve isolated server ids: %v", err)
	}
	if len(servers) != 0 {
		t.Fatalf("expected isolated config to disable servers, got %#v", servers)
	}

	explicit, err := configs.ResolveConfig("explicit")
	if err != nil {
		t.Fatalf("resolve explicit config: %v", err)
	}
	servers, err = configs.ResolveMCPServerIDs(explicit)
	if err != nil {
		t.Fatalf("resolve explicit server ids: %v", err)
	}
	if !reflect.DeepEqual(servers, []string{"setta", "github"}) {
		t.Fatalf("unexpected explicit server ids %#v", servers)
	}
	if got := configs.MCPServers[DefaultServerID].URL; got != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected rewritten setta url, got %q", got)
	}
}

func TestLoadRejectsEmbeddedConfigIDAndUnknownServers(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, "llm_config.json")
	payload := `{
  "configs": {
    "primary": {
      "id": "other",
      "model": "gpt-4o-mini"
    }
  },
  "mcpServers": {
    "bad__id": {
      "transport": "sse",
      "url": "http://127.0.0.1:8000/mcp"
    }
  }
}`
	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatalf("write llm config: %v", err)
	}

	_, err := Load(path, LoadOptions{})
	if err == nil {
		t.Fatal("expected load error")
	}
	if !strings.Contains(err.Error(), "cannot declare an id") && !strings.Contains(err.Error(), "cannot include '__'") {
		t.Fatalf("unexpected error %v", err)
	}
}

func TestSaveStripsTemporaryConfigsAndEmbeddedIDs(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, "llm_config.json")
	configs := AllConfigs{
		Configs: map[string]Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				Temporary: false,
			},
			"temp": {
				ID:        "temp",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				Temporary: true,
			},
		},
		MCPServers: map[string]ServerConfig{
			DefaultServerID: {
				Transport: TransportSSE,
				URL:       "http://127.0.0.1:8000/mcp",
			},
		},
		DefaultConfigID: "temp",
	}

	if err := Save(path, configs); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read persisted llm config: %v", err)
	}
	if strings.Contains(string(content), `"id"`) {
		t.Fatalf("expected persisted llm config to omit embedded ids, got %s", string(content))
	}
	if strings.Contains(string(content), `"temp"`) {
		t.Fatalf("expected temporary config to be stripped, got %s", string(content))
	}
	if strings.Contains(string(content), `"default_config_id": "temp"`) {
		t.Fatalf("expected default config id reset when temporary config stripped, got %s", string(content))
	}
}

func TestBuildRequestParamsAndRuntimeAPIKeys(t *testing.T) {
	t.Parallel()

	configs := AllConfigs{
		Configs: map[string]Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				BaseURL:   "https://example.com/v1",
				APIKeyEnv: "OPENAI_API_KEY",
				OtherParams: map[string]any{
					"temperature": 0.2,
				},
			},
		},
		MCPServers: map[string]ServerConfig{},
	}

	config, err := configs.ResolveConfig("primary")
	if err != nil {
		t.Fatalf("resolve primary config: %v", err)
	}
	params, apiKeyEnv := configs.BuildRequestParams(config)
	if apiKeyEnv != "OPENAI_API_KEY" {
		t.Fatalf("unexpected api key env %q", apiKeyEnv)
	}
	if params["model"] != "gpt-4o-mini" {
		t.Fatalf("unexpected model param %#v", params["model"])
	}
	if params["custom_llm_provider"] != "openai" {
		t.Fatalf("unexpected provider param %#v", params["custom_llm_provider"])
	}
	if params["api_base"] != "https://example.com/v1" {
		t.Fatalf("unexpected api base param %#v", params["api_base"])
	}
	if params["temperature"] != 0.2 {
		t.Fatalf("unexpected temperature param %#v", params["temperature"])
	}

	processEnv := map[string]string{
		"OPENAI_API_KEY": "process",
		"UNUSED":         "value",
	}
	managedEnv := map[string]string{
		"OPENAI_API_KEY": "managed",
	}
	apiKeys := ResolveRuntimeAPIKeys(configs, managedEnv, processEnv)
	if !reflect.DeepEqual(apiKeys, map[string]string{"OPENAI_API_KEY": "managed"}) {
		t.Fatalf("unexpected runtime api keys %#v", apiKeys)
	}
}

func TestReadEnvFileAndRuntimeFiltersConfiguredKeysOnly(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	envPath := filepath.Join(root, ".env")
	if err := os.WriteFile(envPath, []byte("OPENAI_API_KEY=quoted-value\nUNUSED=drop\n"), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	envVars, err := ReadEnvFile(envPath)
	if err != nil {
		t.Fatalf("read env file: %v", err)
	}
	if envVars["OPENAI_API_KEY"] != "quoted-value" {
		t.Fatalf("unexpected env value %#v", envVars["OPENAI_API_KEY"])
	}

	runtime, err := NewRuntime(AllConfigs{
		Configs: map[string]Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	runtime.UpdateAPIKeys(envVars)

	if !reflect.DeepEqual(runtime.APIKeys(), map[string]string{"OPENAI_API_KEY": "quoted-value"}) {
		t.Fatalf("unexpected runtime api keys %#v", runtime.APIKeys())
	}
}

func TestReadEnvFileParsesSupportedDotEnvForms(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	envPath := filepath.Join(root, ".env")
	// Cover the dotenv forms this managed-run API-key path intentionally
	// supports without pulling in a broader parser dependency.
	payload := strings.Join([]string{
		"# ignored comment",
		"export OPENAI_API_KEY=openai-secret",
		`ANTHROPIC_API_KEY="anthropic secret"`,
		`MODEL_CONTEXT='claude sonnet'`,
		`TRAILING_COMMENT=value # trailing`,
		`BLANK_VALUE=`,
		`ESCAPED_NEWLINE="line1\nline2"`,
		`LITERAL_DOLLAR=${HOME}`,
		`ESCAPED_SPACE=hello\ world`,
		"",
	}, "\n")
	if err := os.WriteFile(envPath, []byte(payload), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	envVars, err := ReadEnvFile(envPath)
	if err != nil {
		t.Fatalf("read env file: %v", err)
	}

	// The parser preserves the bounded Python-aligned behavior this path uses:
	// quoting, blank assignments, escaped newlines, literal ${...}, and comment
	// trimming on unquoted values.
	want := map[string]string{
		"OPENAI_API_KEY":    "openai-secret",
		"ANTHROPIC_API_KEY": "anthropic secret",
		"MODEL_CONTEXT":     "claude sonnet",
		"TRAILING_COMMENT":  "value",
		"BLANK_VALUE":       "",
		"ESCAPED_NEWLINE":   "line1\nline2",
		"LITERAL_DOLLAR":    "${HOME}",
		"ESCAPED_SPACE":     `hello\ world`,
	}
	if !reflect.DeepEqual(envVars, want) {
		t.Fatalf("unexpected parsed env vars:\n got: %#v\nwant: %#v", envVars, want)
	}
}

func TestReadEnvFileRejectsInvalidDotEnvSyntax(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	envPath := filepath.Join(root, ".env")
	// Malformed quoted values should fail deterministically instead of being
	// partially accepted.
	if err := os.WriteFile(envPath, []byte(`OPENAI_API_KEY="unterminated`+"\n"), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	_, err := ReadEnvFile(envPath)
	if err == nil {
		t.Fatal("expected parse error")
	}
	if !strings.Contains(err.Error(), "parse env file") {
		t.Fatalf("unexpected error %v", err)
	}
}
