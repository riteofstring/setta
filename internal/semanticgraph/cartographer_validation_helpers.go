package semanticgraph

import (
	"fmt"
	"strconv"
	"strings"
)

func validateCartographerTimestamps(label string, values ...string) error {
	for _, value := range values {
		if value == "" {
			continue
		}
		if err := validateTimestamp(label+" timestamp", value); err != nil {
			return err
		}
	}
	return nil
}

func optionalIDsFromStrings(label string, values []string) []optionalStoreID {
	result := make([]optionalStoreID, 0, len(values))
	for _, value := range values {
		result = append(result, optionalStoreID{label: label, value: value})
	}
	return result
}

func validateCartographerEventRefs(values []string, label string) error {
	for _, value := range values {
		if err := validateCartographerEventRef(value, label); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerEventRef(value string, label string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.ContainsAny(value, " \t\r\n") {
		return fmt.Errorf("%s %q must not contain whitespace", label, value)
	}
	return nil
}

func validateCartographerWorkflowCursor(value string, label string) error {
	if value == "" {
		return nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return fmt.Errorf("%s must be <stream-id>:<sequence>: %s", label, value)
	}
	if err := validateStorageID(label+" stream id", streamID); err != nil {
		return err
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return fmt.Errorf("%s sequence must be a non-negative integer: %s", label, value)
	}
	return nil
}

func validateOutputOrdinalMap(values map[string]int, label string) error {
	for runItemID, ordinal := range values {
		if err := validateStoreIDs(label+" run item id", runItemID); err != nil {
			return err
		}
		if ordinal < 0 {
			return fmt.Errorf("%s ordinal for %s must not be negative: %d", label, runItemID, ordinal)
		}
	}
	return nil
}
