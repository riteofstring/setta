package runtime

import (
	"errors"
	"testing"
)

func TestDetectRuntimeInfrastructureProviderUsesExplicitProvider(t *testing.T) {
	provider, err := detectRuntimeInfrastructureProvider(infrastructureProbeFixture(
		map[string]string{runtimeInfrastructureProviderEnv: "google cloud compute"},
		nil,
	))
	if err != nil {
		t.Fatalf("detect runtime infrastructure provider: %v", err)
	}
	if provider.ID != "google-cloud" {
		t.Fatalf("provider id = %q, want google-cloud", provider.ID)
	}
}

func TestDetectRuntimeInfrastructureProviderRejectsUnsupportedExplicitProvider(t *testing.T) {
	_, err := detectRuntimeInfrastructureProvider(infrastructureProbeFixture(
		map[string]string{runtimeInfrastructureProviderEnv: "unsupported-cloud"},
		nil,
	))
	if err == nil {
		t.Fatal("expected unsupported provider error")
	}
}

func TestDetectRuntimeInfrastructureProviderUsesExactDMISignals(t *testing.T) {
	tests := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{
			name: "aws",
			files: map[string]string{
				"/sys/class/dmi/id/sys_vendor": "Amazon EC2\n",
			},
			want: "aws",
		},
		{
			name: "google cloud",
			files: map[string]string{
				"/sys/class/dmi/id/product_name": "Google Compute Engine\n",
			},
			want: "google-cloud",
		},
		{
			name: "azure",
			files: map[string]string{
				"/sys/class/dmi/id/chassis_asset_tag": "7783-7084-3265-9085-8269-3286-77\n",
				"/sys/class/dmi/id/sys_vendor":        "Microsoft Corporation\n",
			},
			want: "azure",
		},
		{
			name: "hetzner",
			files: map[string]string{
				"/sys/class/dmi/id/sys_vendor": "Hetzner\n",
			},
			want: "hetzner",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			provider, err := detectRuntimeInfrastructureProvider(infrastructureProbeFixture(nil, test.files))
			if err != nil {
				t.Fatalf("detect runtime infrastructure provider: %v", err)
			}
			if provider.ID != test.want {
				t.Fatalf("provider id = %q, want %q", provider.ID, test.want)
			}
		})
	}
}

func TestDetectRuntimeInfrastructureProviderFallsBackToUnknown(t *testing.T) {
	provider, err := detectRuntimeInfrastructureProvider(infrastructureProbeFixture(nil, nil))
	if err != nil {
		t.Fatalf("detect runtime infrastructure provider: %v", err)
	}
	if provider.ID != "unknown" {
		t.Fatalf("provider id = %q, want unknown", provider.ID)
	}
}

func infrastructureProbeFixture(env map[string]string, files map[string]string) infrastructureProbe {
	return infrastructureProbe{
		getenv: func(key string) (string, bool) {
			value, ok := env[key]
			return value, ok
		},
		readText: func(path string) (string, error) {
			value, ok := files[path]
			if !ok {
				return "", errors.New("not found")
			}
			return value, nil
		},
	}
}
