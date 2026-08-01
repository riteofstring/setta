package main

import "testing"

func TestValidateProbeFixtureRequiresExactBoundedToken(t *testing.T) {
	t.Parallel()

	const token = "SETTA_PHASE0_0123456789abcdef0123456789abcdef"
	got, err := validateProbeFixture([]byte(token + "\n"))
	if err != nil {
		t.Fatalf("validateProbeFixture() error = %v", err)
	}
	if got != token {
		t.Fatalf("validateProbeFixture() = %q, want %q", got, token)
	}

	invalid := []string{
		"",
		token,
		token + "\nextra\n",
		"SETTA_PHASE0_0123456789ABCDEF0123456789ABCDEF\n",
		"SETTA_PHASE0_0123456789abcdef\n",
		"OTHER_0123456789abcdef0123456789abcdef\n",
	}
	for _, value := range invalid {
		if _, err := validateProbeFixture([]byte(value)); err == nil {
			t.Fatalf("validateProbeFixture() accepted %q", value)
		}
	}
}
