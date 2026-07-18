package speech

import (
	"errors"
	"strings"
	"testing"
)

func TestOpenAIClientConfigFromEnvironmentReadsOpenAIAPIKey(t *testing.T) {
	config, err := OpenAIClientConfigFromEnvironment(func(name string) string {
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
	if config.BaseURL != "" || config.AllowTestBaseURL {
		t.Fatalf("provider override = %+v, want production defaults", config)
	}
}

func TestOpenAIClientConfigFromEnvironmentLeavesSpeechOptional(t *testing.T) {
	config, err := OpenAIClientConfigFromEnvironment(func(string) string { return "" }, ignoreEnvironmentClear)
	if err != nil {
		t.Fatalf("speech config from environment: %v", err)
	}
	if config.APIKey != "" {
		t.Fatalf("speech API key = %q, want empty", config.APIKey)
	}
}

func TestOpenAIClientConfigFromEnvironmentGuardsE2EBaseURL(t *testing.T) {
	const baseURL = "http://127.0.0.1:24891/v1"
	t.Run("without E2E", func(t *testing.T) {
		_, err := OpenAIClientConfigFromEnvironment(func(name string) string {
			if name == E2EBaseURLEnvironmentVariable {
				return baseURL
			}
			return ""
		}, ignoreEnvironmentClear)
		if err == nil || !strings.Contains(err.Error(), "requires SETTA_E2E=1") {
			t.Fatalf("error = %v, want E2E guard error", err)
		}
	})

	t.Run("with E2E", func(t *testing.T) {
		config, err := OpenAIClientConfigFromEnvironment(func(name string) string {
			switch name {
			case e2eEnvironmentVariable:
				return "1"
			case E2EBaseURLEnvironmentVariable:
				return baseURL
			default:
				return ""
			}
		}, ignoreEnvironmentClear)
		if err != nil {
			t.Fatalf("speech config from environment: %v", err)
		}
		if config.BaseURL != baseURL || !config.AllowTestBaseURL {
			t.Fatalf("provider override = %+v, want guarded E2E URL", config)
		}
	})
}

func TestOpenAIClientConfigFromEnvironmentValidatesValues(t *testing.T) {
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
			_, err := OpenAIClientConfigFromEnvironment(test.getenv, ignoreEnvironmentClear)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}

	if _, err := OpenAIClientConfigFromEnvironment(nil, ignoreEnvironmentClear); err == nil {
		t.Fatal("nil environment reader succeeded")
	}
}

func TestOpenAIClientConfigFromEnvironmentClearsAPIKey(t *testing.T) {
	var cleared string
	_, err := OpenAIClientConfigFromEnvironment(func(string) string { return "" }, func(name string) error {
		cleared = name
		return nil
	})
	if err != nil {
		t.Fatalf("clear speech API key: %v", err)
	}
	if cleared != APIKeyEnvironmentVariable {
		t.Fatalf("cleared environment variable = %q, want %q", cleared, APIKeyEnvironmentVariable)
	}

	if _, err := OpenAIClientConfigFromEnvironment(func(string) string { return "" }, nil); err == nil {
		t.Fatal("nil environment clearer succeeded")
	}
	clearErr := errors.New("environment is read-only")
	_, err = OpenAIClientConfigFromEnvironment(
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
