package appdefinition

import (
	"strings"

	"setta/internal/projectstate"
)

const defaultDocumentPluginDataKey = "setta-json-render-app-gen"

type DocumentStorage struct {
	pluginID string
}

func StorageForPlugin(pluginID string) DocumentStorage {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		trimmedPluginID = defaultDocumentPluginDataKey
	}
	return DocumentStorage{pluginID: trimmedPluginID}
}

func (s DocumentStorage) pluginDataKey() string {
	if strings.TrimSpace(s.pluginID) == "" {
		return defaultDocumentPluginDataKey
	}
	return s.pluginID
}

func (s DocumentStorage) StoredDocumentAppDefinitionRaw(
	document projectstate.Document,
) projectstate.RawJSON {
	if document.PluginData == nil {
		return nil
	}
	return cloneAppDefinitionRawJSON(document.PluginData[s.pluginDataKey()])
}

func (s DocumentStorage) WithStoredDocumentAppDefinition(
	document projectstate.Document,
	raw projectstate.RawJSON,
) projectstate.Document {
	next := document.Clone()
	pluginDataKey := s.pluginDataKey()
	if len(raw) == 0 {
		if len(next.PluginData) == 0 {
			return next
		}
		delete(next.PluginData, pluginDataKey)
		if len(next.PluginData) == 0 {
			next.PluginData = nil
		}
		return next
	}
	if next.PluginData == nil {
		next.PluginData = map[string]projectstate.RawJSON{}
	}
	next.PluginData[pluginDataKey] = cloneAppDefinitionRawJSON(raw)
	return next
}

func StoredDocumentAppDefinitionRaw(document projectstate.Document) projectstate.RawJSON {
	return StorageForPlugin("").StoredDocumentAppDefinitionRaw(document)
}

func WithStoredDocumentAppDefinition(
	document projectstate.Document,
	raw projectstate.RawJSON,
) projectstate.Document {
	return StorageForPlugin("").WithStoredDocumentAppDefinition(document, raw)
}
