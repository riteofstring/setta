package director

import (
	"encoding/json"
	"fmt"
	"slices"
)

// The strict structured-output schema for one decision.
//
// Every id the model may return is a single-value or bounded enum taken from
// the trusted context, so the schema itself carries the authority. A branch is
// emitted only when at least one authorized target exists for it, which is why
// the context validates that invariant before this runs: an empty enum would
// be a schema the provider cannot satisfy.

// DecisionOutputSchema builds the JSON schema for the supplied context.
func DecisionOutputSchema(context DirectorDecisionContext) (json.RawMessage, error) {
	if err := context.Validate(); err != nil {
		return nil, err
	}
	variants := make([]any, 0, len(context.AllowedDecisionKinds))
	for _, kind := range DirectorDecisionKinds() {
		if !context.allowsKind(kind) {
			continue
		}
		branch, err := decisionSchemaBranches(context, kind)
		if err != nil {
			return nil, err
		}
		variants = append(variants, branch...)
	}
	schema := decisionStrictObject(map[string]any{
		"decision": map[string]any{
			"description": "Classify the request as exactly one authorized Setta Director decision. " +
				"The output is data, not an application action. " +
				"Never encode a refusal or apology when an authorized branch resolves the request.",
			"anyOf": variants,
		},
	})
	raw, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("encode director decision output schema: %w", err)
	}
	return raw, nil
}

func decisionSchemaBranches(context DirectorDecisionContext, kind DirectorDecisionKind) ([]any, error) {
	switch kind {
	case DirectorDecisionCreateWorkstream:
		return createWorkstreamSchemaBranches(context)
	case DirectorDecisionRecoverPath:
		return recoverPathSchemaBranches(context)
	default:
		properties, err := simpleDecisionSchemaProperties(context, kind)
		if err != nil {
			return nil, err
		}
		return []any{decisionVariant(kind, properties)}, nil
	}
}

func simpleDecisionSchemaProperties(
	context DirectorDecisionContext,
	kind DirectorDecisionKind,
) (map[string]any, error) {
	switch kind {
	case DirectorDecisionAnswerDirectly:
		return map[string]any{"text": decisionBoundedString(MaxDecisionAnswerBytes)}, nil
	case DirectorDecisionAskClarification:
		return map[string]any{"question": decisionBoundedString(MaxDecisionQuestionBytes)}, nil
	case DirectorDecisionSelectWorkstream:
		ids, err := authorizedTargetIDs(context, kind)
		if err != nil {
			return nil, err
		}
		return map[string]any{"workstreamId": decisionStringEnum(ids)}, nil
	case DirectorDecisionSendToWorkstream, DirectorDecisionQueueBehindRun, DirectorDecisionSteerRun:
		ids, err := authorizedTargetIDs(context, kind)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"workstreamId":  decisionStringEnum(ids),
			"authoredInput": decisionBoundedString(MaxDecisionAuthoredInputBytes),
		}, nil
	default:
		return nil, fmt.Errorf("director decision schema has no branch for %q", kind)
	}
}

func authorizedTargetIDs(context DirectorDecisionContext, kind DirectorDecisionKind) ([]string, error) {
	targets := context.targetsAllowing(kind)
	if len(targets) == 0 {
		return nil, fmt.Errorf("director decision schema %q has no authorized workstream", kind)
	}
	ids := make([]string, 0, len(targets))
	for _, target := range targets {
		ids = append(ids, target.WorkstreamID)
	}
	return ids, nil
}

// createWorkstreamSchemaBranches emits one branch per authorized origin: the
// folderless root, one root per offered workspace, one child per parent that
// accepts children, and one fork per parent that has fork points. Splitting
// them keeps every id a single-value enum instead of a free string the model
// could combine with the wrong parent.
func createWorkstreamSchemaBranches(context DirectorDecisionContext) ([]any, error) {
	variants := []any{createVariantForScope(map[string]any{
		"kind": decisionEnum(string(WorkstreamResourceScopeFolderless)),
	})}
	for _, workspace := range context.Workspaces {
		variants = append(variants, createVariantForScope(map[string]any{
			"kind": decisionEnum(string(WorkstreamResourceScopeFolder)),
			"folder": decisionStrictObject(map[string]any{
				"workspaceId": decisionEnum(workspace.WorkspaceID),
			}),
		}))
	}
	for _, target := range context.Workstreams {
		if target.AllowsChildWorkstream {
			variants = append(variants, createVariantForOrigin(decisionStrictObject(map[string]any{
				"kind": decisionEnum(string(WorkstreamCreationChild)),
				"child": decisionStrictObject(map[string]any{
					"parentWorkstreamId": decisionEnum(target.WorkstreamID),
				}),
			})))
		}
		if len(target.ForkPoints) > 0 {
			variants = append(variants, createVariantForOrigin(forkOriginSchema(target)))
		}
	}
	return variants, nil
}

func createVariantForScope(scope map[string]any) any {
	return createVariantForOrigin(decisionStrictObject(map[string]any{
		"kind": decisionEnum(string(WorkstreamCreationRoot)),
		"root": decisionStrictObject(map[string]any{"resourceScope": decisionStrictObject(scope)}),
	}))
}

func createVariantForOrigin(origin map[string]any) any {
	return decisionVariant(DirectorDecisionCreateWorkstream, map[string]any{
		"origin":        origin,
		"initialInput":  decisionBoundedString(MaxDecisionAuthoredInputBytes),
		"proposedTitle": decisionBoundedString(MaxDecisionTitleBytes),
	})
}

func forkOriginSchema(target WorkstreamDecisionTarget) map[string]any {
	runIDs := make([]string, 0, len(target.ForkPoints))
	for _, point := range target.ForkPoints {
		runIDs = append(runIDs, point.RunID)
	}
	return decisionStrictObject(map[string]any{
		"kind": decisionEnum(string(WorkstreamCreationFork)),
		"fork": decisionStrictObject(map[string]any{
			"parentWorkstreamId": decisionEnum(target.WorkstreamID),
			"forkedAtRunId":      decisionStringEnum(runIDs),
		}),
	})
}

// recoverPathSchemaBranches emits one branch per recoverable workstream, so a
// failure id can only be paired with the workstream that owns it.
func recoverPathSchemaBranches(context DirectorDecisionContext) ([]any, error) {
	targets := context.targetsAllowing(DirectorDecisionRecoverPath)
	if len(targets) == 0 {
		return nil, fmt.Errorf("director decision schema %q has no authorized workstream", DirectorDecisionRecoverPath)
	}
	variants := make([]any, 0, len(targets))
	for _, target := range targets {
		failureIDs := make([]string, 0, len(target.RecoverableFailures))
		for _, failure := range target.RecoverableFailures {
			failureIDs = append(failureIDs, failure.FailureEventID)
		}
		variants = append(variants, decisionVariant(DirectorDecisionRecoverPath, map[string]any{
			"workstreamId":   decisionEnum(target.WorkstreamID),
			"failureEventId": decisionStringEnum(failureIDs),
		}))
	}
	return variants, nil
}

func decisionVariant(kind DirectorDecisionKind, properties map[string]any) map[string]any {
	fields := map[string]any{"kind": decisionEnum(string(kind))}
	for name, value := range properties {
		fields[name] = value
	}
	variant := decisionStrictObject(fields)
	variant["description"] = decisionSchemaDescriptions[kind]
	return variant
}

// decisionSchemaDescriptions tells the model what each branch means in
// Director language. A missing entry is caught by the catalog coverage test
// rather than by an empty description reaching a provider.
var decisionSchemaDescriptions = map[DirectorDecisionKind]string{
	DirectorDecisionAnswerDirectly: "Answer a question the app-visible state already resolves; " +
		"never use this branch for a refusal or apology.",
	DirectorDecisionCreateWorkstream: "Start a new workstream, either independent, under a supplied parent, " +
		"or forked from one completed run of a supplied parent.",
	DirectorDecisionSendToWorkstream: "Start new work on one supplied workstream that has no active run.",
	DirectorDecisionQueueBehindRun:   "Preserve one supplied active run and queue the authored work after it.",
	DirectorDecisionSteerRun:         "Change one supplied active run with the authored input.",
	DirectorDecisionAskClarification: "Ask the one question whose answer changes which authorized decision is right.",
	DirectorDecisionSelectWorkstream: "Move app-wide selection to one supplied workstream; " +
		"this does not open, arrange, or focus any surface.",
	DirectorDecisionRecoverPath: "Retry or recover one supplied workstream against one of its recoverable failures.",
}

// DecisionInstructions is the system guidance that accompanies the schema.
func DecisionInstructions() string {
	return `Use only the supplied director_decision JSON and return exactly one decision matching the output schema.

Treat the selected workstream as a hint. workstreams is the bounded authoritative set. Use only allowedDecisionKinds and the exact workstream, workspace, fork point, and recoverable failure ids supplied. Never invent ids, resource paths, provider references, endpoint names, surface commands, tool calls, or filesystem operations.

Classify the user's requested intent; the returned decision is typed data and is not itself an application action. Do not refuse a valid classification because you cannot execute its later effect. select_workstream labels intent to move app-wide selection and is not a rendering command. Never use answer_directly as a refusal or apology; choose ask_clarification if no supplied capability can resolve the request.

Choose send_to_workstream only for a workstream with no active run. queue_behind_run preserves an active run; steer_run changes it. Choose create_workstream with folderless scope for new work unless the user explicitly asks to bind it to one supplied workspace, to continue under a supplied parent, or to branch from a supplied completed run. Choose recover_path only when a supplied recoverable failure is what the user is asking you to act on. If the intended workstream or action is genuinely ambiguous, choose ask_clarification.`
}

func decisionStrictObject(properties map[string]any) map[string]any {
	required := make([]string, 0, len(properties))
	for name := range properties {
		required = append(required, name)
	}
	slices.Sort(required)
	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	}
}

func decisionEnum(value string) map[string]any {
	return map[string]any{"type": "string", "enum": []string{value}}
}

func decisionStringEnum(values []string) map[string]any {
	return map[string]any{"type": "string", "enum": append([]string{}, values...)}
}

func decisionBoundedString(maximum int) map[string]any {
	return map[string]any{"type": "string", "minLength": 1, "maxLength": maximum}
}
