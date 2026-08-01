package probefixture

import (
	"regexp"
	"testing"
)

func TestNewTokenMatchesFixtureContract(t *testing.T) {
	t.Parallel()

	token, err := NewToken()
	if err != nil {
		t.Fatalf("NewToken() error = %v", err)
	}
	matched, err := regexp.MatchString(Pattern, token)
	if err != nil {
		t.Fatalf("compile fixture Pattern: %v", err)
	}
	if !matched {
		t.Fatalf("NewToken() = %q, want pattern %q", token, Pattern)
	}
}
