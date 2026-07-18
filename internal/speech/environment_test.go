package speech

import (
	"errors"
	"strings"
	"testing"
)

func TestOpenAIStartupConfigFromServerEnvironmentReadsOpenAIAPIKey(t *testing.T) {
	config, err := OpenAIStartupConfigFromServerEnvironment(func(name string) string {
		if name == APIKeyEnvironmentVariable {
			return testSpeechAPIKey
		}
		return ""
	}, ignoreEnvironmentClear)
	if err != nil {
		t.Fatalf("speech config from environment: %v", err)
	}
	if config.APIKey != testSpeechAPIKey {
		t.Fatalf("speech API key = %q, want OpenAI API key", config.APIKey)
	}
	if config.Provider.BaseURL != "" || config.Provider.AllowTestBaseURL {
		t.Fatalf("provider override = %+v, want production defaults", config.Provider)
	}
}

func TestOpenAIStartupConfigFromServerEnvironmentLeavesSpeechOptional(t *testing.T) {
	config, err := OpenAIStartupConfigFromServerEnvironment(func(string) string { return "" }, ignoreEnvironmentClear)
	if err != nil {
		t.Fatalf("speech config from environment: %v", err)
	}
	if config.APIKey != "" {
		t.Fatalf("speech API key = %q, want empty", config.APIKey)
	}
}

func TestOpenAIProviderConfigFromDesktopEnvironmentDoesNotReadOpenAIAPIKey(t *testing.T) {
	requested := map[string]int{}
	config, err := OpenAIProviderConfigFromDesktopEnvironment(func(name string) string {
		requested[name]++
		if name == APIKeyEnvironmentVariable {
			return "secret value"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("desktop speech config from environment: %v", err)
	}
	if config != (OpenAIProviderConfig{}) {
		t.Fatalf("desktop provider config = %+v, want production defaults", config)
	}
	if requested[APIKeyEnvironmentVariable] != 0 {
		t.Fatalf("desktop provider environment requested %s", APIKeyEnvironmentVariable)
	}
}

func TestOpenAIProviderConfigFromDesktopEnvironmentGuardsE2EBaseURL(t *testing.T) {
	const baseURL = "http://127.0.0.1:24891/v1"
	t.Run("without E2E", func(t *testing.T) {
		_, err := OpenAIProviderConfigFromDesktopEnvironment(func(name string) string {
			if name == E2EBaseURLEnvironmentVariable {
				return baseURL
			}
			return ""
		})
		if err == nil || !strings.Contains(err.Error(), "requires SETTA_E2E=1") {
			t.Fatalf("error = %v, want E2E guard error", err)
		}
	})

	t.Run("with E2E", func(t *testing.T) {
		config, err := OpenAIProviderConfigFromDesktopEnvironment(func(name string) string {
			switch name {
			case e2eEnvironmentVariable:
				return "1"
			case E2EBaseURLEnvironmentVariable:
				return baseURL
			default:
				return ""
			}
		})
		if err != nil {
			t.Fatalf("speech config from environment: %v", err)
		}
		if config.BaseURL != baseURL || !config.AllowTestBaseURL {
			t.Fatalf("provider override = %+v, want guarded E2E URL", config)
		}
	})
}

func TestOpenAIStartupConfigFromServerEnvironmentValidatesValues(t *testing.T) {
	tests := map[string]struct {
		getenv func(string) string
		want   string
	}{
		"invalid key": {
			getenv: func(name string) string {
				if name == APIKeyEnvironmentVariable {
					return "secret value"
				}
				return ""
			},
			want: "visible ASCII",
		},
		"invalid E2E URL": {
			getenv: func(name string) string {
				switch name {
				case e2eEnvironmentVariable:
					return "1"
				case E2EBaseURLEnvironmentVariable:
					return "file:///tmp/provider"
				default:
					return ""
				}
			},
			want: "requires a scheme and host",
		},
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := OpenAIStartupConfigFromServerEnvironment(test.getenv, ignoreEnvironmentClear)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}

	if _, err := OpenAIStartupConfigFromServerEnvironment(nil, ignoreEnvironmentClear); err == nil {
		t.Fatal("nil environment reader succeeded")
	}
}

func TestOpenAIStartupConfigFromServerEnvironmentClearsAPIKey(t *testing.T) {
	var cleared string
	_, err := OpenAIStartupConfigFromServerEnvironment(func(string) string { return "" }, func(name string) error {
		cleared = name
		return nil
	})
	if err != nil {
		t.Fatalf("clear speech API key: %v", err)
	}
	if cleared != APIKeyEnvironmentVariable {
		t.Fatalf("cleared environment variable = %q, want %q", cleared, APIKeyEnvironmentVariable)
	}

	if _, err := OpenAIStartupConfigFromServerEnvironment(func(string) string { return "" }, nil); err == nil {
		t.Fatal("nil environment clearer succeeded")
	}
	clearErr := errors.New("environment is read-only")
	_, err = OpenAIStartupConfigFromServerEnvironment(
		func(string) string { return "" },
		func(string) error { return clearErr },
	)
	if !errors.Is(err, clearErr) || !strings.Contains(err.Error(), APIKeyEnvironmentVariable) {
		t.Fatalf("clear error = %v, want wrapped variable-specific error", err)
	}
}

func ignoreEnvironmentClear(string) error {
	return nil
}
