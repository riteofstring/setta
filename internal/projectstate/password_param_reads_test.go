package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestProjectGetPasswordParamValueReadsStoredSecret(t *testing.T) {
	t.Parallel()

	// Password-param reads must return the stored secret rather than the masked
	// visible payload value.
	project := passwordParamNameAndValueTestProject(t)
	project.passwordSecrets = NewMemoryPasswordSecretStore()
	if err := project.passwordSecrets.Set("shared-secret-impl", "topsecret"); err != nil {
		t.Fatalf("seed password secret: %v", err)
	}

	value, err := project.GetPasswordParamValue("dict-a", "shared-secret")
	if err != nil {
		t.Fatalf("get password param value: %v", err)
	}
	if value != "topsecret" {
		t.Fatalf("expected topsecret, got %q", value)
	}
}

func TestProjectGetPasswordParamValueRejectsNonPasswordParams(t *testing.T) {
	t.Parallel()

	// The owner should reject non-password params explicitly instead of reading
	// arbitrary code-object values through the password-secret path.
	project := passwordParamNameAndValueTestProject(t)
	project.passwordSecrets = NewMemoryPasswordSecretStore()

	_, err := project.GetPasswordParamValue("dict-a", "shared-child")
	if !errors.Is(err, ErrPasswordParamRequired) {
		t.Fatalf("expected ErrPasswordParamRequired, got %v", err)
	}
}

func TestRuntimeGetPasswordParamValueUsesConfiguredSecretStore(t *testing.T) {
	t.Parallel()

	// Runtime reads must preserve the configured password-secret store when the
	// document is served through the live project runtime.
	passwordSecrets := NewMemoryPasswordSecretStore()
	if err := passwordSecrets.Set("shared-secret-impl", "runtime-secret"); err != nil {
		t.Fatalf("seed runtime password secret: %v", err)
	}

	projectRuntime, err := OpenOverlayRuntimeWithOptions(Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects: map[string]Project{
			"project-alpha": passwordParamNameAndValueTestProject(t),
		},
	}, RuntimeOptions{
		PasswordSecrets: passwordSecrets,
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	value, err := projectRuntime.GetPasswordParamValue(
		context.Background(),
		"project-alpha",
		"dict-a",
		"shared-secret",
	)
	if err != nil {
		t.Fatalf("runtime get password param value: %v", err)
	}
	if value != "runtime-secret" {
		t.Fatalf("expected runtime-secret, got %q", value)
	}
}

func TestProjectPasswordSecretsSnapshotIncludesStoredSecretsByImplID(t *testing.T) {
	t.Parallel()

	project := passwordParamNameAndValueTestProject(t)
	project.passwordSecrets = NewMemoryPasswordSecretStore()
	if err := project.passwordSecrets.Set("shared-secret-impl", "snapshot-secret"); err != nil {
		t.Fatalf("seed password secret: %v", err)
	}

	secrets, err := project.PasswordSecretsSnapshot()
	if err != nil {
		t.Fatalf("password secrets snapshot: %v", err)
	}
	if got := secrets["shared-secret-impl"]; got != "snapshot-secret" {
		t.Fatalf("expected snapshot-secret, got %q", got)
	}
}
