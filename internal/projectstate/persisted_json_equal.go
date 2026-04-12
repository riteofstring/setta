package projectstate

import (
	"bytes"
	"encoding/json"
	"fmt"
)

func persistedJSONEqual(left any, right any) (bool, error) {
	leftJSON, err := json.Marshal(left)
	if err != nil {
		return false, fmt.Errorf("encode left persisted json: %w", err)
	}
	rightJSON, err := json.Marshal(right)
	if err != nil {
		return false, fmt.Errorf("encode right persisted json: %w", err)
	}
	return bytes.Equal(leftJSON, rightJSON), nil
}
