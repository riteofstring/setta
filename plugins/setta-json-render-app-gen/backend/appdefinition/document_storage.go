package appdefinition

import "setta/internal/projectstate"

const documentPluginDataKey = "setta-json-render-app-gen"

func StoredDocumentAppDefinitionRaw(document projectstate.Document) projectstate.RawJSON {
	if document.PluginData == nil {
		return nil
	}
	return cloneAppDefinitionRawJSON(document.PluginData[documentPluginDataKey])
}

func WithStoredDocumentAppDefinition(
	document projectstate.Document,
	raw projectstate.RawJSON,
) projectstate.Document {
	next := document.Clone()
	if len(raw) == 0 {
		if len(next.PluginData) == 0 {
			return next
		}
		delete(next.PluginData, documentPluginDataKey)
		if len(next.PluginData) == 0 {
			next.PluginData = nil
		}
		return next
	}
	if next.PluginData == nil {
		next.PluginData = map[string]projectstate.RawJSON{}
	}
	next.PluginData[documentPluginDataKey] = cloneAppDefinitionRawJSON(raw)
	return next
}
