package contracts

func PublicSchemas() map[string]map[string]any {
	return map[string]map[string]any{
		"experimentManifest": ExperimentManifestSchema(),
		"observationSource":  ObservationSourceSchema(),
		"lensMutation":       LensMutationSchema(),
		"lensSnapshot":       LensSnapshotSchema(),
		"selectionPacket":    SelectionPacketSchema(),
		"mutationResult":     MutationResultSchema(),
		"exportResult":       ExportResultSchema(),
		"structuredError":    StructuredErrorSchema(),
		"series":             SeriesSchema(),
	}
}

func ExperimentManifestSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/experiment-manifest-v1.json", reference("#/$defs/manifest"))
}

func ObservationSourceSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/observation-source-v1.json", reference("#/$defs/observationSource"))
}

func LensMutationSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/lens-mutation-v1.json", reference("#/$defs/mutation"))
}

func LensSnapshotSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/lens-snapshot-v1.json", reference("#/$defs/snapshot"))
}

func SelectionPacketSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/selection-packet-v1.json", reference("#/$defs/packet"))
}

func MutationResultSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/mutation-result-v1.json", reference("#/$defs/mutationResult"))
}

func ExportResultSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/export-result-v1.json", reference("#/$defs/exportResult"))
}

func StructuredErrorSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/structured-error-v1.json", reference("#/$defs/error"))
}

func SeriesSchema() map[string]any {
	return rootSchema("https://setta.local/schemas/experiment-lens/series-v1.json", reference("#/$defs/series"))
}

func rootSchema(id string, body map[string]any) map[string]any {
	schema := map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     id,
		"$defs":   definitions(),
	}
	for key, value := range body {
		schema[key] = value
	}
	return schema
}

func definitions() map[string]any {
	return map[string]any{
		"identifier": identifierSchema(),
		"digest":     digestSchema(),
		"path":       pathSchema(),
		"scalar":     scalarSchema(),
		"producer":   producerSchema(),
		"provenance": objectSchema(
			[]string{"producer", "createdAt"},
			map[string]any{
				"producer":  reference("#/$defs/producer"),
				"createdAt": boundedString(1, 40),
			},
		),
		"field": objectSchema(
			[]string{"id", "label", "description", "role", "valueType", "unit", "nullable"},
			map[string]any{
				"id":          reference("#/$defs/identifier"),
				"label":       boundedString(1, 200),
				"description": boundedString(0, 2000),
				"role":        enumSchema("factor", "metric", "timestamp"),
				"valueType":   enumSchema("number", "string", "boolean", "timestamp"),
				"unit":        nullable(boundedString(1, 40)),
				"nullable":    map[string]any{"type": "boolean"},
			},
		),
		"observationReference": objectSchema(
			[]string{"path", "byteLength", "sha256"},
			map[string]any{
				"path":       reference("#/$defs/path"),
				"byteLength": integerSchema(2, 64<<20),
				"sha256":     reference("#/$defs/digest"),
			},
		),
		"artifactReference": objectSchema(
			[]string{"id", "label", "path", "mediaType", "byteLength", "sha256"},
			map[string]any{
				"id":         reference("#/$defs/identifier"),
				"label":      boundedString(1, 300),
				"path":       reference("#/$defs/path"),
				"mediaType":  boundedString(1, 120),
				"byteLength": integerSchema(0, 512<<20),
				"sha256":     reference("#/$defs/digest"),
			},
		),
		"timeline": objectSchema(
			[]string{"axisId", "value"},
			map[string]any{
				"axisId": reference("#/$defs/identifier"),
				"value":  map[string]any{"type": "number"},
			},
		),
		"relation": objectSchema(
			[]string{"observationId", "artifactId", "role", "timeline"},
			map[string]any{
				"observationId": reference("#/$defs/identifier"),
				"artifactId":    reference("#/$defs/identifier"),
				"role":          map[string]any{"type": "string", "pattern": "^[a-z][a-z0-9.-]{0,63}$"},
				"timeline":      nullable(reference("#/$defs/timeline")),
			},
		),
		"presentationSection": presentationSectionSchema(),
		"presentationPlacement": objectSchema(
			[]string{"sectionId", "x", "y", "width", "height"},
			map[string]any{
				"sectionId": reference("#/$defs/identifier"),
				"x":         integerSchema(-100_000, 100_000),
				"y":         integerSchema(-100_000, 100_000),
				"width":     integerSchema(320, 4_000),
				"height":    integerSchema(220, 3_000),
			},
		),
		"presentationViewport": objectSchema(
			[]string{"x", "y", "zoom"},
			map[string]any{
				"x":    numberSchema(-1_000_000, 1_000_000),
				"y":    numberSchema(-1_000_000, 1_000_000),
				"zoom": numberSchema(0.1, 4),
			},
		),
		"presentationView": objectSchema(
			[]string{"id", "name", "viewport", "placements"},
			map[string]any{
				"id":         reference("#/$defs/identifier"),
				"name":       boundedString(1, 120),
				"viewport":   reference("#/$defs/presentationViewport"),
				"placements": arraySchema(reference("#/$defs/presentationPlacement"), 1, maximumPresentationSections),
			},
		),
		"presentation": objectSchema(
			[]string{"initialViewId", "sections", "views"},
			map[string]any{
				"initialViewId": reference("#/$defs/identifier"),
				"sections":      arraySchema(reference("#/$defs/presentationSection"), 1, maximumPresentationSections),
				"views":         arraySchema(reference("#/$defs/presentationView"), 1, maximumPresentationViews),
			},
		),
		"manifest": objectSchema(
			[]string{"version", "id", "title", "summary", "fields", "observations", "artifacts", "relations", "presentation", "provenance"},
			map[string]any{
				"version":      constant(1),
				"id":           reference("#/$defs/identifier"),
				"title":        boundedString(1, 300),
				"summary":      boundedString(1, 4000),
				"fields":       arraySchema(reference("#/$defs/field"), 1, maximumFields),
				"observations": reference("#/$defs/observationReference"),
				"artifacts":    arraySchema(reference("#/$defs/artifactReference"), 0, maximumArtifacts),
				"relations":    arraySchema(reference("#/$defs/relation"), 0, maximumRelations),
				"presentation": reference("#/$defs/presentation"),
				"provenance":   reference("#/$defs/provenance"),
			},
		),
		"observation": objectSchema(
			[]string{"id", "values"},
			map[string]any{
				"id": reference("#/$defs/identifier"),
				"values": map[string]any{
					"type":                 "object",
					"propertyNames":        reference("#/$defs/identifier"),
					"additionalProperties": reference("#/$defs/scalar"),
					"maxProperties":        maximumFields,
				},
			},
		),
		"observationSource": objectSchema(
			[]string{"version", "experimentId", "observations"},
			map[string]any{
				"version":      constant(1),
				"experimentId": reference("#/$defs/identifier"),
				"observations": arraySchema(reference("#/$defs/observation"), 1, maximumObservations),
			},
		),
		"filter": objectSchema(
			[]string{"fieldId", "operator", "values", "minimum", "maximum"},
			map[string]any{
				"fieldId":  reference("#/$defs/identifier"),
				"operator": enumSchema("in", "range"),
				"values":   arraySchema(reference("#/$defs/scalar"), 0, 1000),
				"minimum":  nullable(map[string]any{"type": "number"}),
				"maximum":  nullable(map[string]any{"type": "number"}),
			},
		),
		"range": objectSchema(
			[]string{"id", "artifactId", "artifactSha256", "axisId", "start", "end"},
			map[string]any{
				"id":             reference("#/$defs/identifier"),
				"artifactId":     reference("#/$defs/identifier"),
				"artifactSha256": reference("#/$defs/digest"),
				"axisId":         reference("#/$defs/identifier"),
				"start":          map[string]any{"type": "number"},
				"end":            map[string]any{"type": "number"},
			},
		),
		"note": objectSchema(
			[]string{"id", "text", "observationId", "artifactId", "artifactSha256", "rangeId"},
			map[string]any{
				"id":             reference("#/$defs/identifier"),
				"text":           boundedString(1, 8000),
				"observationId":  nullable(reference("#/$defs/identifier")),
				"artifactId":     nullable(reference("#/$defs/identifier")),
				"artifactSha256": nullable(reference("#/$defs/digest")),
				"rangeId":        nullable(reference("#/$defs/identifier")),
			},
		),
		"selection": objectSchema(
			[]string{"filters", "focusedObservationId", "selectedObservationIds", "selectedArtifactIds", "ranges", "notes"},
			map[string]any{
				"filters":                arraySchema(reference("#/$defs/filter"), 0, maximumFields),
				"focusedObservationId":   nullable(reference("#/$defs/identifier")),
				"selectedObservationIds": arraySchema(reference("#/$defs/identifier"), 0, maximumSelectionIDs),
				"selectedArtifactIds":    arraySchema(reference("#/$defs/identifier"), 0, maximumSelectionIDs),
				"ranges":                 arraySchema(reference("#/$defs/range"), 0, maximumRanges),
				"notes":                  arraySchema(reference("#/$defs/note"), 0, maximumNotes),
			},
		),
		"mutation": objectSchema(
			[]string{"experimentId", "manifestSha256", "observationSourceSha256", "expectedRevision", "selection"},
			map[string]any{
				"experimentId":            reference("#/$defs/identifier"),
				"manifestSha256":          reference("#/$defs/digest"),
				"observationSourceSha256": reference("#/$defs/digest"),
				"expectedRevision":        integerSchema(0, 9007199254740991),
				"selection":               reference("#/$defs/selection"),
			},
		),
		"seriesAxis": objectSchema(
			[]string{"id", "label", "unit"},
			map[string]any{
				"id":    reference("#/$defs/identifier"),
				"label": boundedString(1, 200),
				"unit":  nullable(boundedString(1, 40)),
			},
		),
		"seriesDefinition": objectSchema(
			[]string{"id", "label", "unit"},
			map[string]any{
				"id":    reference("#/$defs/identifier"),
				"label": boundedString(1, 200),
				"unit":  nullable(boundedString(1, 40)),
			},
		),
		"seriesSample": objectSchema(
			[]string{"x", "values"},
			map[string]any{
				"x": map[string]any{"type": "number"},
				"values": map[string]any{
					"type":                 "object",
					"propertyNames":        reference("#/$defs/identifier"),
					"additionalProperties": nullable(map[string]any{"type": "number"}),
				},
			},
		),
		"series": objectSchema(
			[]string{"schemaVersion", "axis", "series", "samples"},
			map[string]any{
				"schemaVersion": constant("setta-series/v1"),
				"axis":          reference("#/$defs/seriesAxis"),
				"series":        arraySchema(reference("#/$defs/seriesDefinition"), 1, 64),
				"samples":       arraySchema(reference("#/$defs/seriesSample"), 1, maximumObservations),
			},
		),
		"error": objectSchema(
			[]string{"code", "message", "field", "artifactId"},
			map[string]any{
				"code":       boundedString(1, 100),
				"message":    boundedString(1, 1000),
				"field":      nullable(boundedString(1, 300)),
				"artifactId": nullable(reference("#/$defs/identifier")),
			},
		),
		"artifactContent": artifactContentSchema(),
		"resolvedArtifact": objectSchema(
			[]string{"reference", "status", "content", "error"},
			map[string]any{
				"reference": reference("#/$defs/artifactReference"),
				"status":    enumSchema("resolved", "failed"),
				"content":   nullable(reference("#/$defs/artifactContent")),
				"error":     nullable(reference("#/$defs/error")),
			},
		),
		"snapshot": objectSchema(
			[]string{"version", "manifestPath", "manifestSha256", "observationSourcePath", "observationSourceSha256", "experiment", "observations", "artifacts", "revision", "selection"},
			map[string]any{
				"version":                 constant(1),
				"manifestPath":            constant("experiment.json"),
				"manifestSha256":          reference("#/$defs/digest"),
				"observationSourcePath":   reference("#/$defs/path"),
				"observationSourceSha256": reference("#/$defs/digest"),
				"experiment":              reference("#/$defs/manifest"),
				"observations":            arraySchema(reference("#/$defs/observation"), 1, maximumObservations),
				"artifacts":               arraySchema(reference("#/$defs/resolvedArtifact"), 0, maximumArtifacts),
				"revision":                integerSchema(0, 9007199254740991),
				"selection":               reference("#/$defs/selection"),
			},
		),
		"packetExperiment": objectSchema(
			[]string{"id", "title", "summary"},
			map[string]any{
				"id":      reference("#/$defs/identifier"),
				"title":   boundedString(1, 300),
				"summary": boundedString(1, 4000),
			},
		),
		"sourceIdentity": objectSchema(
			[]string{"manifestPath", "manifestSha256", "observationSourcePath", "observationSourceSha256"},
			map[string]any{
				"manifestPath":            constant("experiment.json"),
				"manifestSha256":          reference("#/$defs/digest"),
				"observationSourcePath":   reference("#/$defs/path"),
				"observationSourceSha256": reference("#/$defs/digest"),
			},
		),
		"packet": objectSchema(
			[]string{"version", "id", "experiment", "source", "revision", "selection", "observations", "artifacts"},
			map[string]any{
				"version":      constant(1),
				"id":           map[string]any{"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$"},
				"experiment":   reference("#/$defs/packetExperiment"),
				"source":       reference("#/$defs/sourceIdentity"),
				"revision":     integerSchema(0, 9007199254740991),
				"selection":    reference("#/$defs/selection"),
				"observations": arraySchema(reference("#/$defs/observation"), 0, maximumSelectionIDs+1),
				"artifacts":    arraySchema(reference("#/$defs/artifactReference"), 0, maximumArtifacts),
			},
		),
		"mutationResult": objectSchema(
			[]string{"version", "snapshot"},
			map[string]any{"version": constant(1), "snapshot": reference("#/$defs/snapshot")},
		),
		"exportResult": objectSchema(
			[]string{"version", "packet"},
			map[string]any{"version": constant(1), "packet": reference("#/$defs/packet")},
		),
	}
}

func producerSchema() map[string]any {
	agent := objectSchema(
		[]string{"kind", "name", "model", "harness"},
		map[string]any{
			"kind":    constant("agent"),
			"name":    boundedString(1, 200),
			"model":   boundedString(1, 200),
			"harness": boundedString(1, 200),
		},
	)
	ordinary := objectSchema(
		[]string{"kind", "name"},
		map[string]any{
			"kind": enumSchema("human", "application", "script"),
			"name": boundedString(1, 200),
		},
	)
	return map[string]any{"oneOf": []any{agent, ordinary}}
}

func presentationSectionSchema() map[string]any {
	identifier := reference("#/$defs/identifier")
	fieldIDs := arraySchema(identifier, 1, 20)
	base := func(sectionType string, required []string, properties map[string]any) map[string]any {
		allRequired := append([]string{"id", "type", "title"}, required...)
		allProperties := map[string]any{
			"id":    identifier,
			"type":  constant(sectionType),
			"title": boundedString(1, 200),
		}
		for key, value := range properties {
			allProperties[key] = value
		}
		return objectSchema(allRequired, allProperties)
	}
	return map[string]any{"oneOf": []any{
		base("facets", []string{"fieldIds"}, map[string]any{
			"fieldIds": arraySchema(identifier, 1, 12),
		}),
		base("scatter", []string{"xFieldId", "yFieldId"}, map[string]any{
			"xFieldId": identifier, "yFieldId": identifier, "colorFieldId": identifier,
		}),
		base("histogram", []string{"fieldId", "bins"}, map[string]any{
			"fieldId": identifier, "bins": integerSchema(4, 100),
		}),
		base("heatmap", []string{"xFieldId", "yFieldId", "valueFieldId", "aggregation"}, map[string]any{
			"xFieldId": identifier, "yFieldId": identifier, "valueFieldId": identifier,
			"aggregation": enumSchema("count", "mean", "min", "max", "median"),
		}),
		base("parallel", []string{"fieldIds"}, map[string]any{
			"fieldIds": arraySchema(identifier, 2, 12),
		}),
		base("table", []string{"fieldIds"}, map[string]any{"fieldIds": fieldIDs}),
		base("metrics", []string{"fieldIds", "aggregation"}, map[string]any{
			"fieldIds": arraySchema(identifier, 1, 12), "aggregation": enumSchema("count", "mean", "min", "max", "median"),
		}),
		base("timeline", []string{"artifactRole", "detailFieldIds"}, map[string]any{
			"artifactRole":   map[string]any{"type": "string", "pattern": "^[a-z][a-z0-9.-]{0,63}$"},
			"detailFieldIds": arraySchema(identifier, 0, 8),
		}),
		base("gallery", []string{"artifactRoles", "columns"}, map[string]any{
			"artifactRoles": arraySchema(map[string]any{"type": "string", "pattern": "^[a-z][a-z0-9.-]{0,63}$"}, 1, 12),
			"columns":       integerSchema(1, 6),
		}),
	}}
}

func artifactContentSchema() map[string]any {
	text := objectSchema(
		[]string{"kind", "text", "truncated"},
		map[string]any{
			"kind":      constant("text"),
			"text":      map[string]any{"type": "string"},
			"truncated": map[string]any{"type": "boolean"},
		},
	)
	jsonContent := objectSchema(
		[]string{"kind", "json"},
		map[string]any{"kind": constant("json"), "json": map[string]any{}},
	)
	series := objectSchema(
		[]string{"kind", "series"},
		map[string]any{"kind": constant("series"), "series": reference("#/$defs/series")},
	)
	artifact := objectSchema(
		[]string{"kind", "route", "inline", "mediaType", "byteLength", "sha256"},
		map[string]any{
			"kind":       constant("artifact"),
			"route":      boundedString(1, 500),
			"inline":     map[string]any{"type": "boolean"},
			"mediaType":  boundedString(1, 120),
			"byteLength": integerSchema(0, 512<<20),
			"sha256":     reference("#/$defs/digest"),
		},
	)
	return map[string]any{"oneOf": []any{text, jsonContent, series, artifact}}
}

func objectSchema(required []string, properties map[string]any) map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             required,
		"properties":           properties,
	}
}

func arraySchema(items map[string]any, minimum int, maximum int) map[string]any {
	return map[string]any{
		"type":     "array",
		"items":    items,
		"minItems": minimum,
		"maxItems": maximum,
	}
}

func identifierSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"}
}

func digestSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": "^[a-f0-9]{64}$"}
}

func pathSchema() map[string]any {
	return map[string]any{"type": "string", "minLength": 1, "maxLength": 1000, "pattern": `^(?!/)(?!.*(?:^|/)\.\.?/)(?!.*\\)(?!.*//).+$`}
}

func scalarSchema() map[string]any {
	return map[string]any{"anyOf": []any{
		map[string]any{"type": "null"},
		map[string]any{"type": "boolean"},
		map[string]any{"type": "number"},
		map[string]any{"type": "string"},
	}}
}

func boundedString(minimum int, maximum int) map[string]any {
	return map[string]any{"type": "string", "minLength": minimum, "maxLength": maximum}
}

func integerSchema(minimum int, maximum int) map[string]any {
	return map[string]any{"type": "integer", "minimum": minimum, "maximum": maximum}
}

func numberSchema(minimum float64, maximum float64) map[string]any {
	return map[string]any{"type": "number", "minimum": minimum, "maximum": maximum}
}

func constant(value any) map[string]any {
	return map[string]any{"const": value}
}

func enumSchema(values ...string) map[string]any {
	items := make([]any, len(values))
	for index, value := range values {
		items[index] = value
	}
	return map[string]any{"enum": items}
}

func nullable(schema map[string]any) map[string]any {
	return map[string]any{"anyOf": []any{schema, map[string]any{"type": "null"}}}
}

func reference(path string) map[string]any {
	return map[string]any{"$ref": path}
}
