package projectstate

type appDefinitionOptionalMetadata struct {
	AppSpecVersion *string
	CatalogID      *string
	Routes         *[]AppRoute
}

func applyOptionalAppDefinitionMetadata(definition *AppDefinition, metadata appDefinitionOptionalMetadata) {
	if metadata.AppSpecVersion != nil {
		definition.AppSpecVersion = *metadata.AppSpecVersion
	}
	if metadata.CatalogID != nil {
		definition.CatalogID = *metadata.CatalogID
	}
	if metadata.Routes != nil {
		definition.Routes = append([]AppRoute(nil), (*metadata.Routes)...)
	}
}

func applyOptionalAppDefinitionJSONField[T any](target *RawJSON, value *T, field string) error {
	if value == nil {
		return nil
	}
	raw, err := marshalAppDefinitionRawJSON(*value, field)
	if err != nil {
		return err
	}
	*target = raw
	return nil
}
