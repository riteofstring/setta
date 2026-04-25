package appspec

import (
	"errors"
	"testing"
)

func TestForPluginRejectsBlankPluginID(t *testing.T) {
	t.Parallel()

	_, err := ForPlugin(" \t ")
	if !errors.Is(err, ErrPluginIDRequired) {
		t.Fatalf("expected ErrPluginIDRequired, got %v", err)
	}
}
