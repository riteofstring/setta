package chat

import "fmt"

func validateWorkspaceID(value string) error {
	return validateStorageID("workspace id", value)
}

func validateConversationID(value string) error {
	return validateStorageID("conversation id", value)
}

func validateMessageID(value string) error {
	return validateStorageID("message id", value)
}

func validateRunID(value string) error {
	return validateStorageID("run id", value)
}

func validateRunItemID(value string) error {
	return validateStorageID("run item id", value)
}

func validateStorageID(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	for _, valueRune := range value {
		if isStorageIDRune(valueRune) {
			continue
		}
		return fmt.Errorf("%s %q must contain only letters, numbers, underscores, or hyphens", label, value)
	}
	return nil
}

func validateOptionalStorageID(label string, value string) error {
	if value == "" {
		return nil
	}
	return validateStorageID(label, value)
}

func isStorageIDRune(value rune) bool {
	return value >= 'a' && value <= 'z' ||
		value >= 'A' && value <= 'Z' ||
		value >= '0' && value <= '9' ||
		value == '_' ||
		value == '-'
}
