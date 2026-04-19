package appdefinition

import (
	"errors"
	"testing"
)

func TestStorageForPluginRejectsBlankPluginID(t *testing.T) {
	t.Parallel()

	_, err := StorageForPlugin(" \n ")
	if !errors.Is(err, ErrPluginIDRequired) {
		t.Fatalf("expected ErrPluginIDRequired, got %v", err)
	}
}
