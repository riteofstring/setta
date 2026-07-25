package director

import (
	"fmt"
	"strings"
	"time"
)

func validateIdentifier(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}

func validateTrimmedText(label string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}

// validateTimestamp requires a canonical UTC RFC3339 timestamp so ordering
// comparisons in the projector and the renderer never depend on formatting.
func validateTimestamp(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return fmt.Errorf("%s must be RFC3339: %w", label, err)
	}
	if _, offset := parsed.Zone(); offset != 0 || parsed.UTC().Format(time.RFC3339Nano) != value {
		return fmt.Errorf("%s must be a canonical UTC RFC3339 timestamp", label)
	}
	return nil
}

func validateOptionalTimestamp(label string, value *string) error {
	if value == nil {
		return nil
	}
	return validateTimestamp(label, *value)
}

func validateTimestampOrder(label string, earlier string, later string) error {
	earlierTime, err := time.Parse(time.RFC3339Nano, earlier)
	if err != nil {
		return fmt.Errorf("%s earlier timestamp must be RFC3339: %w", label, err)
	}
	laterTime, err := time.Parse(time.RFC3339Nano, later)
	if err != nil {
		return fmt.Errorf("%s later timestamp must be RFC3339: %w", label, err)
	}
	if laterTime.Before(earlierTime) {
		return fmt.Errorf("%s moves backwards from %s to %s", label, earlier, later)
	}
	return nil
}

func validateCount(label string, value int) error {
	if value < 0 {
		return fmt.Errorf("%s must not be negative: %d", label, value)
	}
	return nil
}

func validateSequence(label string, value int) error {
	if value <= 0 {
		return fmt.Errorf("%s must be positive: %d", label, value)
	}
	return nil
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
