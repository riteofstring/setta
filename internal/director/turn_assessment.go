package director

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
)

// One Director turn owns its own request assessment. The assessment is a
// structured tool call inside the Director's existing provider turn, not a
// separate model invocation and not durable app activity. It makes the model
// choose the authority for starting work before any Setta tool can run.

const directorAssessRequestTool = "assess_request"

const maxDirectorAssessmentQuestionBytes = 4 * 1024

const maxDirectorAssessmentEvidenceBytes = 4 * 1024

type directorAssessmentBasis string

const (
	directorAssessmentNonWorkOrControl        directorAssessmentBasis = "non_work_or_control"
	directorAssessmentExplicitlyCheckable     directorAssessmentBasis = "explicitly_checkable_outcome"
	directorAssessmentNamedAuthority          directorAssessmentBasis = "named_authority_yields_one_answer"
	directorAssessmentMissingOutcomeAuthority directorAssessmentBasis = "missing_outcome_authority"
)

type directorAssessmentArguments struct {
	Basis    directorAssessmentBasis `json:"basis"`
	Evidence string                  `json:"evidence"`
	Question string                  `json:"question"`
}

type directorTurnAssessment struct {
	mutex    sync.Mutex
	assessed bool
	basis    directorAssessmentBasis
}

// assessDirectorTurnTools puts the private assessment tool first, hides the
// lower-level request_user_choice tool, and gates every app tool behind the
// assessment. The supplied tools are already recorder-instrumented, so a
// missing-requirement assessment durably records only the useful user-choice
// request; the assessment itself never appears in the graph or replay history.
func assessDirectorTurnTools(tools []SettaTool) ([]SettaTool, error) {
	assessment := &directorTurnAssessment{}
	var requestUserChoice *SettaTool
	appTools := make([]SettaTool, 0, len(tools))
	for index := range tools {
		tool := tools[index]
		if tool.Name == "request_user_choice" {
			if requestUserChoice != nil {
				return nil, fmt.Errorf("Director tool catalog contains duplicate %s", tool.Name)
			}
			choice := tool
			requestUserChoice = &choice
			continue
		}
		appTools = append(appTools, tool)
	}
	if requestUserChoice == nil {
		return nil, fmt.Errorf("Director tool catalog is missing request_user_choice")
	}

	assessed := make([]SettaTool, 0, len(appTools)+1)
	assessed = append(assessed, assessment.tool(*requestUserChoice))
	for _, tool := range appTools {
		next := tool
		next.Handler = assessment.guard(tool)
		assessed = append(assessed, next)
	}
	return assessed, nil
}

func (assessment *directorTurnAssessment) tool(requestUserChoice SettaTool) SettaTool {
	return SettaTool{
		Name: directorAssessRequestTool,
		Description: "Make the required first decision before any other Setta tool. Classify the current request " +
			"as non_work_or_control, explicitly_checkable_outcome, named_authority_yields_one_answer, or " +
			"missing_outcome_authority. Proceed only when the accepted request states an observable completion contract, or " +
			"delegates every material outcome choice to an identified authority available to the worker that can uniquely " +
			"resolve it. An objective or motivation alone is not a completion contract. Context merely being available, or " +
			"the possibility that investigation might find authority, is not delegation. Put one concise, directly grounded " +
			"reason in evidence: identify the supplied contract, the delegated authority and choice it uniquely resolves, " +
			"the unresolved material choice, or why this is only conversation/control. When neither form of authority exists, " +
			"use missing_outcome_authority. For that basis, also supply one concise outcome-defining question; this assessment " +
			"records that work is waiting for the user's answer, so ask exactly that question in prose and call no other " +
			"tool. For every other basis, question must be empty. Do not call this for a prose-only conversational response.",
		InputSchema: settaToolSchema(map[string]any{
			"basis": settaToolEnum(
				"The authority for responding to the current request.",
				[]string{
					string(directorAssessmentNonWorkOrControl),
					string(directorAssessmentExplicitlyCheckable),
					string(directorAssessmentNamedAuthority),
					string(directorAssessmentMissingOutcomeAuthority),
				},
			),
			"evidence": map[string]any{
				"type":      "string",
				"minLength": 1,
				"maxLength": maxDirectorAssessmentEvidenceBytes,
				"description": "One concise, directly grounded reason for the selected basis. Do not merely restate " +
					"the objective or speculate about what investigation might find.",
			},
			"question": map[string]any{
				"type":      "string",
				"maxLength": maxDirectorAssessmentQuestionBytes,
				"description": "One concise outcome-defining question for missing_outcome_authority, " +
					"or an empty string for every other basis.",
			},
		}, []string{"basis", "evidence", "question"}),
		Handler: assessment.handle(requestUserChoice),
	}
}

func (assessment *directorTurnAssessment) handle(requestUserChoice SettaTool) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		var payload directorAssessmentArguments
		if err := decodeSettaToolArguments(arguments, &payload); err != nil {
			return directorAssessmentRetryReceipt(err), nil
		}
		if err := payload.validate(); err != nil {
			return directorAssessmentRetryReceipt(err), nil
		}

		assessment.mutex.Lock()
		defer assessment.mutex.Unlock()
		if assessment.assessed {
			return SettaToolReceipt{
				Tool:    directorAssessRequestTool,
				Summary: "This request was already assessed. Continue from the accepted assessment.",
			}, nil
		}

		if payload.Basis == directorAssessmentMissingOutcomeAuthority {
			encoded, err := json.Marshal(settaRequestUserChoiceArguments{Question: payload.Question})
			if err != nil {
				return SettaToolReceipt{}, fmt.Errorf("encode Director user-choice request: %w", err)
			}
			receipt, err := requestUserChoice.Handler(ctx, encoded)
			if err != nil {
				return SettaToolReceipt{}, err
			}
			assessment.assessed = true
			assessment.basis = payload.Basis
			return receipt, nil
		}

		assessment.assessed = true
		assessment.basis = payload.Basis
		return SettaToolReceipt{
			Tool:    directorAssessRequestTool,
			Summary: "Request assessment accepted. Continue according to the selected basis.",
		}, nil
	}
}

func (assessment *directorTurnAssessment) guard(tool SettaTool) SettaToolHandler {
	return func(ctx context.Context, arguments json.RawMessage) (SettaToolReceipt, error) {
		assessment.mutex.Lock()
		assessed := assessment.assessed
		basis := assessment.basis
		assessment.mutex.Unlock()

		if !assessed {
			return SettaToolReceipt{
				Tool: tool.Name,
				Summary: "This call did not run. Call setta.assess_request first, then continue only when its " +
					"selected basis permits it.",
			}, nil
		}
		if basis == directorAssessmentMissingOutcomeAuthority {
			return SettaToolReceipt{
				Tool:    tool.Name,
				Summary: "This call did not run. Work is waiting for the user's answer; ask the recorded question and call no other tool.",
			}, nil
		}
		return tool.Handler(ctx, arguments)
	}
}

func (arguments directorAssessmentArguments) validate() error {
	if err := validateDecisionText(
		"Director assessment evidence",
		arguments.Evidence,
		maxDirectorAssessmentEvidenceBytes,
	); err != nil {
		return err
	}
	switch arguments.Basis {
	case directorAssessmentNonWorkOrControl,
		directorAssessmentExplicitlyCheckable,
		directorAssessmentNamedAuthority:
		if arguments.Question != "" {
			return fmt.Errorf("basis %s requires an empty question", arguments.Basis)
		}
		return nil
	case directorAssessmentMissingOutcomeAuthority:
		return validateDecisionText(
			"Director assessment question",
			arguments.Question,
			maxDirectorAssessmentQuestionBytes,
		)
	default:
		return fmt.Errorf("unsupported Director assessment basis %q", arguments.Basis)
	}
}

func directorAssessmentRetryReceipt(cause error) SettaToolReceipt {
	return SettaToolReceipt{
		Tool:    directorAssessRequestTool,
		Summary: fmt.Sprintf("The assessment was not accepted: %s. Correct it and call assess_request again.", cause),
	}
}
