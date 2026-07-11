package speech

import (
	"strings"
	"testing"
)

func TestOpenAIClientConfigFromEnvironmentReadsOnlySpeechCredential(t *testing.T) {
	config, err := OpenAIClientConfigFromEnvironment(func(name string) string {
		switch name {
		case APIKeyEnvironmentVariable:
			return testSpeechAPIKey
		case "OPENAI_API_KEY":
			return "sk-generic-must-not-be-used"
		default:
			return ""
		}
	})
	if err != nil {
		t.Fatalf("speech config from environment: %v", err)
	}
	if config.APIKey != testSpeechAPIKey {
		t.Fatalf("speech API key = %q, want Setta-specific value", config.APIKey)
	}
	if config.BaseURL != "" || config.AllowTestBaseURL {
		t.Fatalf("provider override = %+v, want production defaults", config)
	}
}

func TestOpenAIClientConfigFromEnvironmentLeavesSpeechOptional(t *testing.T) {
	config, err := OpenAIClientConfigFromEnvironment(func(name string) string {
		if name == "OPENAI_API_KEY" {
			return "sk-generic-must-not-be-used"
		}
		return ""
	})
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
		})
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
		})
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
			_, err := OpenAIClientConfigFromEnvironment(test.getenv)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want containing %q", err, test.want)
			}
		})
	}

	if _, err := OpenAIClientConfigFromEnvironment(nil); err == nil {
		t.Fatal("nil environment reader succeeded")
	}
}
