package settingsstate

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
)

// DefaultFileName is the canonical live settings-state path under setta_files.
const DefaultFileName = "setta-settings.json"

var (
	//go:embed defaults.json
	defaultDocumentJSON []byte

	defaultDocumentOnce sync.Once
	defaultDocument     Document
	defaultDocumentErr  error
)

func DefaultDocument() (Document, error) {
	defaultDocumentOnce.Do(func() {
		var raw any
		if err := json.Unmarshal(defaultDocumentJSON, &raw); err != nil {
			defaultDocumentErr = fmt.Errorf("decode embedded settings defaults: %w", err)
			return
		}
		object, ok := raw.(map[string]any)
		if !ok {
			defaultDocumentErr = ErrSettingsPayloadNotObject
			return
		}
		defaultDocument = Document(cloneMap(object))
	})
	if defaultDocumentErr != nil {
		return nil, defaultDocumentErr
	}
	return defaultDocument.Clone(), nil
}
