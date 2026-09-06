package contracts

func ProjectSchema() map[string]any {
	definitions := map[string]any{
		"jsonValue": jsonValueSchema(),
		"sizeValue": map[string]any{"anyOf": []any{
			map[string]any{"type": "number", "exclusiveMinimum": 0},
			map[string]any{"const": "auto"},
		}},
		"runtime": objectSchema([]string{"kind", "entrypoint"}, map[string]any{
			"kind":       map[string]any{"type": "string", "pattern": `^[a-z][a-z0-9-]{0,63}$`},
			"entrypoint": requiredTextSchema(),
		}),
		"topLevelLayout": objectSchema([]string{"x", "y", "width", "height", "zIndex"}, map[string]any{
			"x":      map[string]any{"type": "number"},
			"y":      map[string]any{"type": "number"},
			"width":  nullablePositiveNumberSchema(),
			"height": nullablePositiveNumberSchema(),
			"zIndex": map[string]any{"type": "integer"},
		}),
		"viewport": objectSchema([]string{"x", "y", "zoom"}, map[string]any{
			"x": map[string]any{"type": "number"}, "y": map[string]any{"type": "number"}, "zoom": map[string]any{"type": "number", "exclusiveMinimum": 0},
		}),
		"binding": bindingSchema(),
		"section": sectionSchema(),
	}
	return map[string]any{
		"$schema":  "https://json-schema.org/draft/2020-12/schema",
		"$id":      "https://setta.local/schemas/realtime/project-v1.schema.json",
		"title":    "Setta Realtime Project V1",
		"$defs":    definitions,
		"type":     "object",
		"required": []string{"version", "id", "revision", "name", "runtime", "sections", "layout", "bindings", "configuration"},
		"properties": map[string]any{
			"version":  map[string]any{"const": ProjectVersion},
			"id":       idSchema(),
			"revision": map[string]any{"type": "integer", "minimum": 0},
			"name":     requiredTextSchema(),
			"runtime":  map[string]any{"$ref": "#/$defs/runtime"},
			"sections": map[string]any{
				"type":                 "object",
				"maxProperties":        maximumSections,
				"propertyNames":        idSchema(),
				"additionalProperties": map[string]any{"$ref": "#/$defs/section"},
			},
			"layout": objectSchema([]string{"topLevelSections", "viewport"}, map[string]any{
				"topLevelSections": map[string]any{
					"type":                 "object",
					"maxProperties":        maximumSections,
					"propertyNames":        idSchema(),
					"additionalProperties": map[string]any{"$ref": "#/$defs/topLevelLayout"},
				},
				"viewport": map[string]any{"anyOf": []any{map[string]any{"type": "null"}, map[string]any{"$ref": "#/$defs/viewport"}}},
			}),
			"bindings": map[string]any{"type": "array", "maxItems": maximumBindings, "items": map[string]any{"$ref": "#/$defs/binding"}},
			"configuration": map[string]any{
				"type":                 "object",
				"maxProperties":        maximumConfiguration,
				"propertyNames":        idSchema(),
				"additionalProperties": map[string]any{"$ref": "#/$defs/jsonValue"},
			},
		},
		"additionalProperties": false,
	}
}

func RuntimeSchema() map[string]any {
	definitions := map[string]any{
		"jsonValue": jsonValueSchema(),
		"identity": objectSchema([]string{"sessionId", "bindingId", "invocationId", "sequence"}, map[string]any{
			"sessionId": idSchema(), "bindingId": idSchema(), "invocationId": idSchema(), "sequence": map[string]any{"type": "integer", "minimum": 0},
		}),
		"error": objectSchema([]string{"code", "message"}, map[string]any{
			"code": idSchema(), "message": textSchema(),
		}),
	}
	definitions["invocation"] = objectSchema([]string{"identity", "state", "error"}, map[string]any{
		"identity": map[string]any{"$ref": "#/$defs/identity"},
		"state":    map[string]any{"enum": []string{"queued", "running", "streaming", "completed", "cancelled", "timedOut", "failed", "crashed", "superseded"}},
		"error":    nullableRef("#/$defs/error"),
	})
	definitions["update"] = objectSchema([]string{"identity", "progress", "message", "outputs"}, map[string]any{
		"identity": map[string]any{"$ref": "#/$defs/identity"},
		"progress": map[string]any{"type": []string{"number", "null"}, "minimum": 0, "maximum": 1},
		"message":  textSchema(),
		"outputs": map[string]any{
			"type": "object", "maxProperties": maximumOutputs, "propertyNames": handlerNameSchema(), "additionalProperties": map[string]any{"$ref": "#/$defs/jsonValue"},
		},
	})
	definitions["snapshot"] = objectSchema([]string{"sessionId", "workerState", "values", "invocations"}, map[string]any{
		"sessionId":   idSchema(),
		"workerState": map[string]any{"enum": []string{"stopped", "starting", "ready", "failed", "replacing"}},
		"values": map[string]any{
			"type": "object", "maxProperties": maximumSections * 4, "propertyNames": idSchema(), "additionalProperties": map[string]any{"$ref": "#/$defs/jsonValue"},
		},
		"invocations": map[string]any{
			"type": "object", "maxProperties": maximumBindings * 68, "propertyNames": idSchema(), "additionalProperties": map[string]any{"$ref": "#/$defs/invocation"},
		},
	})
	definitions["log"] = objectSchema([]string{"stream", "text"}, map[string]any{
		"stream": map[string]any{"enum": []string{"stdout", "stderr"}}, "text": textSchema(),
	})
	variants := []any{
		runtimeEnvelopeVariant("snapshot", "snapshot", "#/$defs/snapshot"),
		runtimeEnvelopeVariant("invocation", "invocation", "#/$defs/invocation"),
		runtimeEnvelopeVariant("update", "update", "#/$defs/update"),
		runtimeEnvelopeVariant("log", "log", "#/$defs/log"),
		runtimeEnvelopeVariant("error", "error", "#/$defs/error"),
	}
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     "https://setta.local/schemas/realtime/runtime-v1.schema.json",
		"title":   "Setta Realtime Runtime V1",
		"$defs":   definitions,
		"oneOf":   variants,
	}
}

func RuntimeCommandSchema() map[string]any {
	identity := objectSchema([]string{"sessionId", "bindingId", "invocationId", "sequence"}, map[string]any{
		"sessionId": idSchema(), "bindingId": idSchema(), "invocationId": idSchema(), "sequence": map[string]any{"type": "integer", "minimum": 1},
	})
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     "https://setta.local/schemas/realtime/runtime-command-v1.schema.json",
		"title":   "Setta Realtime Runtime Command V1",
		"$defs":   map[string]any{"jsonValue": jsonValueSchema(), "identity": identity},
		"oneOf": []any{
			objectSchema([]string{"type", "sessionId", "sectionId", "event", "payload"}, map[string]any{
				"type": map[string]any{"const": "event"}, "sessionId": idSchema(), "sectionId": idSchema(),
				"event": map[string]any{"enum": []string{"change", "submit", "press", "snapshot"}}, "payload": map[string]any{"$ref": "#/$defs/jsonValue"},
			}),
			objectSchema([]string{"type", "identity"}, map[string]any{
				"type": map[string]any{"const": "cancel"}, "identity": map[string]any{"$ref": "#/$defs/identity"},
			}),
		},
	}
}

func ContentReferenceSchema() map[string]any {
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     "https://setta.local/schemas/realtime/content-reference-v1.schema.json",
		"title":   "Setta Realtime Content Reference V1",
		"type":    "object",
		"required": []string{
			"id", "mediaType", "byteLength", "sha256", "invocationId",
		},
		"properties": map[string]any{
			"id":           idSchema(),
			"mediaType":    requiredTextSchema(),
			"byteLength":   map[string]any{"type": "integer", "minimum": 0, "maximum": 256 << 20},
			"sha256":       map[string]any{"type": "string", "pattern": `^[0-9a-f]{64}$`},
			"invocationId": idSchema(),
		},
		"additionalProperties": false,
	}
}

func WorkerSchema() map[string]any {
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     "https://setta.local/schemas/realtime/worker-v1.schema.json",
		"title":   "Setta Realtime Worker Protocol V1",
		"$defs": map[string]any{
			"jsonValue": jsonValueSchema(),
			"rpcError": objectSchema([]string{"code", "message"}, map[string]any{
				"code": map[string]any{"type": "integer"}, "message": requiredTextSchema(),
			}),
		},
		"oneOf": []any{
			objectSchema([]string{"jsonrpc", "id", "method", "params"}, map[string]any{
				"jsonrpc": map[string]any{"const": "2.0"}, "id": map[string]any{"type": []string{"string", "integer"}}, "method": requiredTextSchema(), "params": map[string]any{"$ref": "#/$defs/jsonValue"},
			}),
			objectSchema([]string{"jsonrpc", "method", "params"}, map[string]any{
				"jsonrpc": map[string]any{"const": "2.0"}, "method": requiredTextSchema(), "params": map[string]any{"$ref": "#/$defs/jsonValue"},
			}),
			objectSchema([]string{"jsonrpc", "id", "result"}, map[string]any{
				"jsonrpc": map[string]any{"const": "2.0"}, "id": map[string]any{"type": []string{"string", "integer"}}, "result": map[string]any{"$ref": "#/$defs/jsonValue"},
			}),
			objectSchema([]string{"jsonrpc", "id", "error"}, map[string]any{
				"jsonrpc": map[string]any{"const": "2.0"}, "id": map[string]any{"type": []string{"string", "integer"}}, "error": map[string]any{"$ref": "#/$defs/rpcError"},
			}),
		},
	}
}

func sectionSchema() map[string]any {
	base := func(kind string, data map[string]any) map[string]any {
		return objectSchema(
			[]string{"id", "kind", "name", "width", "height", "overflowMode", "positionAndSizeLocked", "isHorizontalOrientation", "styleColor", "tagColor", "children", "data"},
			map[string]any{
				"id": idSchema(), "kind": map[string]any{"const": kind}, "name": requiredTextSchema(),
				"width": map[string]any{"$ref": "#/$defs/sizeValue"}, "height": map[string]any{"$ref": "#/$defs/sizeValue"},
				"overflowMode": map[string]any{"type": "boolean"}, "positionAndSizeLocked": map[string]any{"type": "boolean"},
				"isHorizontalOrientation": map[string]any{"type": "boolean"}, "styleColor": colorSchema(), "tagColor": colorSchema(),
				"children": map[string]any{"type": "array", "maxItems": maximumChildren, "uniqueItems": true, "items": idSchema()},
				"data":     data,
			},
		)
	}
	return map[string]any{"oneOf": []any{
		base("input", objectSchema([]string{"inputKind", "value", "label"}, map[string]any{
			"inputKind": map[string]any{"enum": []string{"text", "number", "boolean"}}, "value": map[string]any{"$ref": "#/$defs/jsonValue"}, "label": textSchema(),
		})),
		base("button", objectSchema([]string{"label"}, map[string]any{"label": requiredTextSchema()})),
		base("output", objectSchema([]string{"value"}, map[string]any{"value": map[string]any{"$ref": "#/$defs/jsonValue"}})),
		base("status", objectSchema([]string{"level", "message"}, map[string]any{
			"level": map[string]any{"enum": []string{"idle", "info", "success", "error"}}, "message": textSchema(),
		})),
		base("drawing", objectSchema([]string{"scene", "width", "height", "background"}, map[string]any{
			"scene": map[string]any{"$ref": "#/$defs/jsonValue"}, "width": boundedIntegerSchema(1, 8192), "height": boundedIntegerSchema(1, 8192), "background": map[string]any{"type": "string", "pattern": `^#[0-9A-Fa-f]{6}$`},
		})),
	}}
}

func bindingSchema() map[string]any {
	return objectSchema([]string{"id", "trigger", "handler", "arguments", "scheduling", "outputs"}, map[string]any{
		"id": idSchema(),
		"trigger": objectSchema([]string{"sectionId", "event"}, map[string]any{
			"sectionId": idSchema(), "event": map[string]any{"enum": []string{"change", "submit", "press", "snapshot"}},
		}),
		"handler": handlerNameSchema(),
		"arguments": map[string]any{
			"type": "object", "maxProperties": maximumArguments, "propertyNames": handlerNameSchema(), "additionalProperties": map[string]any{"$ref": "#/$defs/jsonValue"},
		},
		"scheduling": objectSchema([]string{"mode", "debounceMilliseconds", "concurrencyGroup", "concurrencyLimit"}, map[string]any{
			"mode": map[string]any{"enum": []string{"once", "latest", "parallel"}}, "debounceMilliseconds": boundedIntegerSchema(0, 60_000),
			"concurrencyGroup": idSchema(), "concurrencyLimit": boundedIntegerSchema(1, 64),
		}),
		"outputs": map[string]any{
			"type": "object", "maxProperties": maximumOutputs, "propertyNames": handlerNameSchema(),
			"additionalProperties": objectSchema([]string{"sectionId", "field"}, map[string]any{
				"sectionId": idSchema(), "field": map[string]any{"enum": []string{"value", "contentRef", "message", "level", "progress", "scene"}},
			}),
		},
	})
}

func runtimeEnvelopeVariant(kind string, property string, reference string) map[string]any {
	return objectSchema([]string{"type", property}, map[string]any{
		"type": map[string]any{"const": kind}, property: map[string]any{"$ref": reference},
	})
}

func objectSchema(required []string, properties map[string]any) map[string]any {
	return map[string]any{"type": "object", "required": required, "properties": properties, "additionalProperties": false}
}

func jsonValueSchema() map[string]any {
	return map[string]any{"anyOf": []any{
		map[string]any{"type": "null"},
		map[string]any{"type": "boolean"},
		map[string]any{"type": "number"},
		textSchema(),
		map[string]any{"type": "array", "items": map[string]any{"$ref": "#/$defs/jsonValue"}},
		map[string]any{"type": "object", "additionalProperties": map[string]any{"$ref": "#/$defs/jsonValue"}},
	}}
}

func idSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`}
}

func handlerNameSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^[A-Za-z_][A-Za-z0-9_]{0,127}$`}
}

func textSchema() map[string]any {
	return map[string]any{"type": "string"}
}

func requiredTextSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^\S(?:[\s\S]*\S)?$`}
}

func colorSchema() map[string]any {
	return map[string]any{"type": []string{"string", "null"}, "pattern": `^#[0-9A-Fa-f]{6}$`}
}

func nullablePositiveNumberSchema() map[string]any {
	return map[string]any{"anyOf": []any{map[string]any{"type": "null"}, map[string]any{"type": "number", "exclusiveMinimum": 0}}}
}

func nullableRef(reference string) map[string]any {
	return map[string]any{"anyOf": []any{map[string]any{"type": "null"}, map[string]any{"$ref": reference}}}
}

func boundedIntegerSchema(minimum int, maximum int) map[string]any {
	return map[string]any{"type": "integer", "minimum": minimum, "maximum": maximum}
}
