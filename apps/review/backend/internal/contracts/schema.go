package contracts

func ReviewRequestSchema() map[string]any {
	return publicSchema("review-request-v1.schema.json", "Setta Review Request V1", "reviewRequest")
}

func ReviewResponseSchema() map[string]any {
	return publicSchema("review-response-v1.schema.json", "Setta Review Response V1", "reviewResponse")
}

func ReviewSnapshotSchema() map[string]any {
	return publicSchema("review-snapshot-v1.schema.json", "Setta Review Snapshot V1", "reviewSnapshot")
}

func ReviewMutationSchema() map[string]any {
	return publicSchema("review-mutation-v1.schema.json", "Setta Review Mutation V1", "reviewMutation")
}

func ProjectManifestSchema() map[string]any {
	return publicSchema("project-manifest-v1.schema.json", "Setta Review Project Manifest V1", "projectManifest")
}

func ExternalAssessmentSchema() map[string]any {
	return publicSchema("external-assessment-v1.schema.json", "Setta Review External Assessment V1", "externalAssessment")
}

func ContinuationPacketSchema() map[string]any {
	return publicSchema("continuation-packet-v1.schema.json", "Setta Review Continuation Packet V1", "continuationPacket")
}

func ExportDocumentSchema() map[string]any {
	return publicSchema("export-document-v1.schema.json", "Setta Review Export Document V1", "exportDocument")
}

func MutationResultSchema() map[string]any {
	return publicSchema("mutation-result-v1.schema.json", "Setta Review Mutation Result V1", "mutationResult")
}

func ExportResultSchema() map[string]any {
	return publicSchema("export-result-v1.schema.json", "Setta Review Export Result V1", "exportResult")
}

func StructuredErrorSchema() map[string]any {
	return publicSchema("structured-error-v1.schema.json", "Setta Review Structured Error V1", "structuredError")
}

func PublicSchemas() map[string]map[string]any {
	return map[string]map[string]any{
		"projectManifest":    ProjectManifestSchema(),
		"reviewRequest":      ReviewRequestSchema(),
		"externalAssessment": ExternalAssessmentSchema(),
		"reviewMutation":     ReviewMutationSchema(),
		"reviewSnapshot":     ReviewSnapshotSchema(),
		"reviewResponse":     ReviewResponseSchema(),
		"continuationPacket": ContinuationPacketSchema(),
		"exportDocument":     ExportDocumentSchema(),
		"mutationResult":     MutationResultSchema(),
		"exportResult":       ExportResultSchema(),
		"structuredError":    StructuredErrorSchema(),
	}
}

func publicSchema(filename string, title string, definition string) map[string]any {
	return map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"$id":     "https://setta.local/schemas/review/" + filename,
		"title":   title,
		"$defs":   schemaDefinitions(),
		"$ref":    "#/$defs/" + definition,
	}
}

func schemaDefinitions() map[string]any {
	definitions := map[string]any{}
	definitions["jsonValue"] = map[string]any{
		"oneOf": []any{
			map[string]any{"type": "null"},
			map[string]any{"type": "boolean"},
			map[string]any{"type": "number"},
			map[string]any{"type": "string", "maxLength": maximumTextBytes},
			map[string]any{"type": "array", "items": ref("jsonValue")},
			map[string]any{"type": "object", "additionalProperties": ref("jsonValue")},
		},
	}
	definitions["producerIdentity"] = producerIdentitySchema()
	definitions["provenance"] = closed([]string{"producer", "createdAt"}, map[string]any{
		"producer":  ref("producerIdentity"),
		"createdAt": textSchema(),
	})
	definitions["gitHunk"] = closed([]string{"oldStart", "oldLines", "newStart", "newLines"}, map[string]any{
		"oldStart": nonNegativeInteger(),
		"oldLines": nonNegativeInteger(),
		"newStart": nonNegativeInteger(),
		"newLines": nonNegativeInteger(),
	})
	definitions["evidenceReference"] = evidenceReferenceSchema()
	definitions["evidenceCitation"] = evidenceCitationSchema()
	definitions["evidenceRelation"] = closed([]string{"id", "subjectKind", "subjectId", "evidenceId", "role", "citations"}, map[string]any{
		"id":          idSchema(),
		"subjectKind": enumSchema("claim", "option", "factor"),
		"subjectId":   idSchema(),
		"evidenceId":  idSchema(),
		"role":        enumSchema("supports", "challenges", "qualifies", "informs"),
		"citations":   arraySchema(ref("evidenceCitation"), 0, 64),
	})
	definitions["completionClaim"] = closed([]string{"id", "text"}, map[string]any{"id": idSchema(), "text": requiredTextSchema()})
	definitions["completionRequest"] = closed([]string{"claims"}, map[string]any{
		"claims": arraySchema(ref("completionClaim"), 1, maximumClaims),
	})
	definitions["choiceOption"] = closed([]string{"id", "label", "description", "artifactEvidenceId"}, map[string]any{
		"id": idSchema(), "label": requiredTextSchema(), "description": textSchema(), "artifactEvidenceId": nullable(idSchema()),
	})
	definitions["choiceFactor"] = closed([]string{"id", "label", "description"}, map[string]any{
		"id": idSchema(), "label": requiredTextSchema(), "description": textSchema(),
	})
	definitions["choiceTradeoff"] = closed([]string{"optionId", "factorId", "value", "tone"}, map[string]any{
		"optionId": idSchema(), "factorId": idSchema(), "value": requiredTextSchema(), "tone": enumSchema("support", "risk", "tradeoff", "neutral"),
	})
	definitions["choiceRecommendation"] = closed([]string{"optionId", "rationale"}, map[string]any{
		"optionId": idSchema(), "rationale": requiredTextSchema(),
	})
	definitions["choiceRequest"] = closed([]string{"presentation", "expectedResponse", "options", "factors", "tradeoffs", "recommendation"}, map[string]any{
		"presentation":     enumSchema("matrix", "artifacts"),
		"expectedResponse": enumSchema("selection", "approval"),
		"options":          arraySchema(ref("choiceOption"), 2, maximumOptions),
		"factors":          arraySchema(ref("choiceFactor"), 0, maximumFactors),
		"tradeoffs":        arraySchema(ref("choiceTradeoff"), 0, maximumOptions*maximumFactors),
		"recommendation":   nullable(ref("choiceRecommendation")),
	})
	definitions["reviewRequest"] = reviewRequestSchemaDefinition()
	definitions["assessmentProducer"] = closed([]string{"model", "harness"}, map[string]any{
		"model": requiredTextSchema(), "harness": requiredTextSchema(),
	})
	definitions["externalAssessment"] = closed([]string{"version", "id", "requestId", "claimId", "assessment", "rationale", "caveat", "producer", "createdAt"}, map[string]any{
		"version":    map[string]any{"const": ContractVersion},
		"id":         idSchema(),
		"requestId":  idSchema(),
		"claimId":    idSchema(),
		"assessment": enumSchema("supported", "contradicted", "unproven", "qualified"),
		"rationale":  textSchema(),
		"caveat":     nullable(requiredTextSchema()),
		"producer":   ref("assessmentProducer"),
		"createdAt":  textSchema(),
	})
	definitions["unresolvedItem"] = closed([]string{"subjectKind", "subjectId", "reason"}, map[string]any{
		"subjectKind": enumSchema("request", "claim", "option", "factor"), "subjectId": idSchema(), "reason": requiredTextSchema(),
	})
	definitions["normalizedPoint"] = closed([]string{"x", "y"}, map[string]any{
		"x": map[string]any{"type": "number", "minimum": 0, "maximum": 1}, "y": map[string]any{"type": "number", "minimum": 0, "maximum": 1},
	})
	definitions["normalizedPath"] = closed([]string{"color", "width", "points"}, map[string]any{
		"color":  map[string]any{"type": "string", "pattern": `^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$`},
		"width":  map[string]any{"type": "number", "exclusiveMinimum": 0, "maximum": 0.1},
		"points": arraySchema(ref("normalizedPoint"), 2, maximumPoints),
	})
	definitions["artifactAnnotation"] = closed([]string{"id", "artifactEvidenceId", "artifactSha256", "paths"}, map[string]any{
		"id": idSchema(), "artifactEvidenceId": idSchema(), "artifactSha256": sha256Schema(), "paths": arraySchema(ref("normalizedPath"), 1, maximumPaths),
	})
	definitions["completionDecision"] = closed([]string{"claimId", "decision", "rationale", "qualification"}, map[string]any{
		"claimId": idSchema(), "decision": enumSchema("accepted", "qualified", "rejected", "needsEvidence"), "rationale": textSchema(), "qualification": nullable(requiredTextSchema()),
	})
	definitions["completionResponse"] = closed([]string{"decisions"}, map[string]any{
		"decisions": arraySchema(ref("completionDecision"), 0, maximumClaims),
	})
	definitions["choiceResponse"] = closed([]string{"outcome", "optionIds", "conditions", "selectedArtifactEvidenceIds"}, map[string]any{
		"outcome":                     enumSchema("selected", "rejected", "qualified", "changesRequested"),
		"optionIds":                   arraySchema(idSchema(), 0, maximumOptions),
		"conditions":                  arraySchema(requiredTextSchema(), 0, maximumClaims),
		"selectedArtifactEvidenceIds": arraySchema(idSchema(), 0, maximumOptions),
	})
	definitions["reviewResponse"] = reviewResponseSchemaDefinition()
	definitions["structuredError"] = closed([]string{"code", "message", "field", "requestId", "evidenceId"}, map[string]any{
		"code": idSchema(), "message": requiredTextSchema(), "field": nullable(requiredTextSchema()), "requestId": nullable(idSchema()), "evidenceId": nullable(idSchema()),
	})
	definitions["resolvedEvidenceContent"] = resolvedEvidenceContentSchema()
	definitions["resolvedEvidence"] = resolvedEvidenceSchema()
	definitions["projectManifest"] = closed([]string{"version", "id", "name", "requests"}, map[string]any{
		"version": map[string]any{"const": ContractVersion}, "id": idSchema(), "name": requiredTextSchema(), "requests": arraySchema(relativePathSchema(), 1, maximumRequests),
	})
	definitions["requestSnapshot"] = closed([]string{"path", "sha256", "request", "assessments", "response", "evidence"}, map[string]any{
		"path": relativePathSchema(), "sha256": sha256Schema(), "request": ref("reviewRequest"),
		"assessments": arraySchema(ref("externalAssessment"), 0, maximumAssessments),
		"response":    nullable(ref("reviewResponse")), "evidence": arraySchema(ref("resolvedEvidence"), 0, maximumEvidence),
	})
	definitions["reviewSnapshot"] = closed([]string{"version", "project", "revision", "requests"}, map[string]any{
		"version": map[string]any{"const": ContractVersion}, "project": ref("projectManifest"), "revision": nonNegativeInteger(), "requests": arraySchema(ref("requestSnapshot"), 1, maximumRequests),
	})
	definitions["importAssessmentOperation"] = closed([]string{"op", "assessment"}, map[string]any{
		"op": map[string]any{"const": "importAssessment"}, "assessment": ref("externalAssessment"),
	})
	definitions["setResponseOperation"] = closed([]string{"op", "response"}, map[string]any{
		"op": map[string]any{"const": "setResponse"}, "response": ref("reviewResponse"),
	})
	definitions["deleteResponseOperation"] = closed([]string{"op", "requestId"}, map[string]any{
		"op": map[string]any{"const": "deleteResponse"}, "requestId": idSchema(),
	})
	definitions["reviewOperation"] = map[string]any{"oneOf": []any{ref("importAssessmentOperation"), ref("setResponseOperation"), ref("deleteResponseOperation")}}
	definitions["reviewMutation"] = closed([]string{"projectId", "expectedRevision", "operations"}, map[string]any{
		"projectId": idSchema(), "expectedRevision": nonNegativeInteger(), "operations": arraySchema(ref("reviewOperation"), 1, maximumOperations),
	})
	definitions["continuationPacket"] = closed([]string{"version", "projectId", "request", "requestSha256", "response", "evidence"}, map[string]any{
		"version": map[string]any{"const": ContractVersion}, "projectId": idSchema(), "request": ref("reviewRequest"), "requestSha256": sha256Schema(), "response": ref("reviewResponse"), "evidence": arraySchema(ref("resolvedEvidence"), 0, maximumEvidence),
	})
	definitions["exportDocument"] = closed([]string{"version", "projectId", "revision", "responses", "continuations"}, map[string]any{
		"version": map[string]any{"const": ContractVersion}, "projectId": idSchema(), "revision": nonNegativeInteger(), "responses": arraySchema(ref("reviewResponse"), 0, maximumRequests), "continuations": arraySchema(ref("continuationPacket"), 0, maximumRequests),
	})
	definitions["mutationResult"] = closed([]string{"version", "snapshot"}, map[string]any{
		"version": map[string]any{"const": ContractVersion}, "snapshot": ref("reviewSnapshot"),
	})
	definitions["exportResult"] = closed([]string{"version", "export"}, map[string]any{
		"version": map[string]any{"const": ContractVersion}, "export": ref("exportDocument"),
	})
	return definitions
}

func producerIdentitySchema() map[string]any {
	agent := closed([]string{"kind", "name", "model", "harness"}, map[string]any{
		"kind": map[string]any{"const": "agent"}, "name": requiredTextSchema(), "model": requiredTextSchema(), "harness": requiredTextSchema(),
	})
	nonAgent := closed([]string{"kind", "name"}, map[string]any{
		"kind": enumSchema("human", "application", "script"), "name": requiredTextSchema(),
	})
	return map[string]any{"oneOf": []any{agent, nonAgent}}
}

func evidenceReferenceSchema() map[string]any {
	gitDiff := closed([]string{"id", "kind", "gitDiff"}, map[string]any{
		"id": idSchema(), "kind": map[string]any{"const": "gitDiff"},
		"gitDiff": closed([]string{"repositoryPath", "baseRevision", "targetRevision", "path", "contextLines", "hunk", "patchSha256"}, map[string]any{
			"repositoryPath": relativeOrDotPathSchema(), "baseRevision": gitRevisionSchema(), "targetRevision": nullable(gitRevisionSchema()), "path": relativePathSchema(),
			"contextLines": map[string]any{"type": "integer", "minimum": 0, "maximum": 20}, "hunk": ref("gitHunk"), "patchSha256": sha256Schema(),
		}),
	})
	text := closed([]string{"id", "kind", "text"}, map[string]any{
		"id": idSchema(), "kind": map[string]any{"const": "text"},
		"text": closed([]string{"path", "mediaType", "startLine", "endLine", "sourceSha256"}, map[string]any{
			"path": relativePathSchema(), "mediaType": map[string]any{"type": "string", "pattern": `^text/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$`}, "startLine": positiveInteger(), "endLine": positiveInteger(), "sourceSha256": sha256Schema(),
		}),
	})
	jsonReference := closed([]string{"id", "kind", "json"}, map[string]any{
		"id": idSchema(), "kind": map[string]any{"const": "json"},
		"json": closed([]string{"path", "pointers", "sourceSha256"}, map[string]any{
			"path": relativePathSchema(), "pointers": arraySchema(jsonPointerSchema(), 0, 64), "sourceSha256": sha256Schema(),
		}),
	})
	artifact := closed([]string{"id", "kind", "artifact"}, map[string]any{
		"id": idSchema(), "kind": map[string]any{"const": "artifact"},
		"artifact": closed([]string{"path", "mediaType", "byteLength", "sha256"}, map[string]any{
			"path": relativePathSchema(), "mediaType": mediaTypeSchema(), "byteLength": nonNegativeInteger(), "sha256": sha256Schema(),
		}),
	})
	return map[string]any{"oneOf": []any{gitDiff, text, jsonReference, artifact}}
}

func evidenceCitationSchema() map[string]any {
	lineRange := closed([]string{"kind", "startLine", "endLine"}, map[string]any{
		"kind": map[string]any{"const": "lineRange"}, "startLine": positiveInteger(), "endLine": positiveInteger(),
	})
	jsonPointer := closed([]string{"kind", "pointer"}, map[string]any{
		"kind": map[string]any{"const": "jsonPointer"}, "pointer": jsonPointerSchema(),
	})
	return map[string]any{"oneOf": []any{lineRange, jsonPointer}}
}

func reviewRequestSchemaDefinition() map[string]any {
	common := map[string]any{
		"version": map[string]any{"const": ContractVersion}, "id": idSchema(), "title": requiredTextSchema(), "requestedDecision": requiredTextSchema(),
		"evidence": arraySchema(ref("evidenceReference"), 0, maximumEvidence), "relations": arraySchema(ref("evidenceRelation"), 0, maximumRelations), "provenance": ref("provenance"),
	}
	completion := cloneProperties(common)
	completion["type"] = map[string]any{"const": "completion"}
	completion["completion"] = ref("completionRequest")
	choice := cloneProperties(common)
	choice["type"] = map[string]any{"const": "choice"}
	choice["choice"] = ref("choiceRequest")
	return map[string]any{"oneOf": []any{
		closed([]string{"version", "id", "type", "title", "requestedDecision", "evidence", "relations", "provenance", "completion"}, completion),
		closed([]string{"version", "id", "type", "title", "requestedDecision", "evidence", "relations", "provenance", "choice"}, choice),
	}}
}

func reviewResponseSchemaDefinition() map[string]any {
	common := map[string]any{
		"version": map[string]any{"const": ContractVersion}, "id": idSchema(), "requestId": idSchema(), "requestSha256": sha256Schema(),
		"status": enumSchema("draft", "final"), "rationale": textSchema(), "unresolved": arraySchema(ref("unresolvedItem"), 0, maximumClaims+maximumOptions+maximumFactors),
		"annotations": arraySchema(ref("artifactAnnotation"), 0, maximumAnnotations), "provenance": ref("provenance"),
	}
	completion := cloneProperties(common)
	completion["type"] = map[string]any{"const": "completion"}
	completion["completion"] = ref("completionResponse")
	choice := cloneProperties(common)
	choice["type"] = map[string]any{"const": "choice"}
	choice["choice"] = ref("choiceResponse")
	return map[string]any{"oneOf": []any{
		closed([]string{"version", "id", "requestId", "requestSha256", "type", "status", "rationale", "unresolved", "annotations", "provenance", "completion"}, completion),
		closed([]string{"version", "id", "requestId", "requestSha256", "type", "status", "rationale", "unresolved", "annotations", "provenance", "choice"}, choice),
	}}
}

func resolvedEvidenceSchema() map[string]any {
	resolved := closed([]string{"evidenceId", "status", "content", "error"}, map[string]any{
		"evidenceId": idSchema(), "status": map[string]any{"const": "resolved"}, "content": ref("resolvedEvidenceContent"), "error": map[string]any{"type": "null"},
	})
	failed := closed([]string{"evidenceId", "status", "content", "error"}, map[string]any{
		"evidenceId": idSchema(), "status": map[string]any{"const": "failed"}, "content": map[string]any{"type": "null"}, "error": ref("structuredError"),
	})
	return map[string]any{"oneOf": []any{resolved, failed}}
}

func resolvedEvidenceContentSchema() map[string]any {
	gitDiff := closed([]string{"kind", "unifiedDiff", "truncated"}, map[string]any{
		"kind": map[string]any{"const": "gitDiff"}, "unifiedDiff": boundedResolvedTextSchema(), "truncated": map[string]any{"type": "boolean"},
	})
	text := closed([]string{"kind", "text", "startLine", "endLine", "truncated"}, map[string]any{
		"kind": map[string]any{"const": "text"}, "text": boundedResolvedTextSchema(), "startLine": positiveInteger(), "endLine": positiveInteger(), "truncated": map[string]any{"type": "boolean"},
	})
	jsonContent := closed([]string{"kind", "json"}, map[string]any{
		"kind": map[string]any{"const": "json"}, "json": ref("jsonValue"),
	})
	artifact := closed([]string{"kind", "route", "mediaType", "byteLength", "sha256"}, map[string]any{
		"kind": map[string]any{"const": "artifact"}, "route": map[string]any{"type": "string", "pattern": `^/`, "maxLength": maximumPathBytes},
		"mediaType": mediaTypeSchema(), "byteLength": nonNegativeInteger(), "sha256": sha256Schema(),
	})
	return map[string]any{"oneOf": []any{gitDiff, text, jsonContent, artifact}}
}

func closed(required []string, properties map[string]any) map[string]any {
	return map[string]any{"type": "object", "required": required, "properties": properties, "additionalProperties": false}
}

func ref(name string) map[string]any {
	return map[string]any{"$ref": "#/$defs/" + name}
}

func nullable(schema map[string]any) map[string]any {
	return map[string]any{"anyOf": []any{map[string]any{"type": "null"}, schema}}
}

func arraySchema(items map[string]any, minimum int, maximum int) map[string]any {
	return map[string]any{"type": "array", "minItems": minimum, "maxItems": maximum, "items": items}
}

func enumSchema(values ...string) map[string]any {
	return map[string]any{"enum": values}
}

func idSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`}
}

func textSchema() map[string]any {
	return map[string]any{"type": "string", "maxLength": maximumTextBytes, "pattern": `^[^\x00]*$`}
}

func requiredTextSchema() map[string]any {
	return map[string]any{"type": "string", "minLength": 1, "maxLength": maximumTextBytes, "pattern": `^(\S|\S[\s\S]*\S)$`}
}

func boundedResolvedTextSchema() map[string]any {
	return map[string]any{"type": "string", "maxLength": maximumResolvedBytes, "pattern": `^[^\x00]*$`}
}

func relativePathSchema() map[string]any {
	return map[string]any{"type": "string", "minLength": 1, "maxLength": maximumPathBytes, "pattern": `^(?!/)(?!.*//)(?!\.\.?(?:/|$))(?!.*\/\.\.?(?:/|$))[^\\\x00]+$`}
}

func relativeOrDotPathSchema() map[string]any {
	return map[string]any{"anyOf": []any{map[string]any{"const": "."}, relativePathSchema()}}
}

func jsonPointerSchema() map[string]any {
	return map[string]any{"type": "string", "maxLength": maximumPathBytes, "pattern": `^(|/(?:[^~]|~[01])*)$`}
}

func mediaTypeSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$`}
}

func sha256Schema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^[0-9a-f]{64}$`}
}

func gitRevisionSchema() map[string]any {
	return map[string]any{"type": "string", "pattern": `^[0-9a-f]{40}([0-9a-f]{24})?$`}
}

func nonNegativeInteger() map[string]any {
	return map[string]any{"type": "integer", "minimum": 0}
}

func positiveInteger() map[string]any {
	return map[string]any{"type": "integer", "minimum": 1}
}

func cloneProperties(properties map[string]any) map[string]any {
	cloned := make(map[string]any, len(properties)+2)
	for name, schema := range properties {
		cloned[name] = schema
	}
	return cloned
}
