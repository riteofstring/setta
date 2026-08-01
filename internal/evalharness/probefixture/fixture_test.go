package probefixture

import "testing"

func TestFixtureContractRequiresExactBoundedToken(t *testing.T) {
	t.Parallel()

	const token = "SETTA_PHASE0_0123456789abcdef0123456789abcdef"
	got, err := DecodeFile([]byte(token + "\n"))
	if err != nil {
		t.Fatalf("DecodeFile() error = %v", err)
	}
	if got != token {
		t.Fatalf("DecodeFile() = %q, want %q", got, token)
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
		if _, err := DecodeFile([]byte(value)); err == nil {
			t.Fatalf("DecodeFile() accepted %q", value)
		}
	}
}

func TestNewTokenMatchesFixtureContract(t *testing.T) {
	t.Parallel()

	token, err := NewToken()
	if err != nil {
		t.Fatalf("NewToken() error = %v", err)
	}
	if _, err := DecodeFile([]byte(token + "\n")); err != nil {
		t.Fatalf("DecodeFile(NewToken()) error = %v", err)
	}
}
