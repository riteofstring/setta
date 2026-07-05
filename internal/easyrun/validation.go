package easyrun

import (
	"errors"
	"fmt"
	"strings"
)

func validateWorkspaceID(workspaceID string) error {
	return validateStorageID("workspace id", workspaceID)
}

func validateEasyRunID(easyRunID string) error {
	return validateStorageID("easy run id", easyRunID)
}

func validateStorageID(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if value != strings.TrimSpace(value) {
		return fmt.Errorf("%s must not contain leading or trailing whitespace", label)
	}
	if strings.ContainsAny(value, `/\`) {
		return fmt.Errorf("%s must not contain path separators", label)
	}
	return nil
}

func validateEventCursor(cursor EasyRunEventCursor) error {
	if cursor.Sequence < 0 {
		return fmt.Errorf("easy-run event sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return errors.New("easy-run event stream id is required for non-zero sequence")
	}
	return nil
}

func validValue[T comparable](candidate T, values []T) bool {
	for _, value := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
