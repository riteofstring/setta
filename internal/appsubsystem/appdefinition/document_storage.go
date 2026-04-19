package appdefinition

import (
	"errors"
	"strings"

	"setta/internal/projectstate"
)

var ErrPluginIDRequired = errors.New("app definition storage plugin id is required")

type DocumentStorage struct {
	pluginID string
}

func StorageForPlugin(pluginID string) (DocumentStorage, error) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return DocumentStorage{}, ErrPluginIDRequired
	}
	return DocumentStorage{pluginID: trimmedPluginID}, nil
}

func MustStorageForPlugin(pluginID string) DocumentStorage {
	storage, err := StorageForPlugin(pluginID)
	if err != nil {
		panic(err)
	}
	return storage
}

func (s DocumentStorage) pluginDataKey() string {
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
