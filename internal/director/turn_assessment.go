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

type directorAssessmentBasis string

const (
	directorAssessmentNonWorkOrControl        directorAssessmentBasis = "non_work_or_control"
	directorAssessmentFullySpecified          directorAssessmentBasis = "fully_specified"
	directorAssessmentObjectivelyDiscoverable directorAssessmentBasis = "objectively_discoverable"
	directorAssessmentMissingUserRequirement  directorAssessmentBasis = "missing_user_requirement"
)

type directorAssessmentArguments struct {
	Basis    directorAssessmentBasis `json:"basis"`
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
			"as non_work_or_control, fully_specified, objectively_discoverable, or missing_user_requirement. " +
			"Use objectively_discoverable only when the request or recent conversation identifies a concrete " +
			"authoritative source available to the worker that yields one objectively correct answer; the possibility " +
			"of investigation and an outside consumer's unstated contract are not authority. For " +
			"missing_user_requirement, supply one concise outcome-defining question; this assessment records that work " +
			"is waiting for the user's answer, so ask exactly that question in prose and call no other tool. For every " +
			"other basis, question must be empty. Do not call this for a prose-only conversational response.",
		InputSchema: settaToolSchema(map[string]any{
			"basis": settaToolEnum(
				"The authority for responding to the current request.",
				[]string{
					string(directorAssessmentNonWorkOrControl),
					string(directorAssessmentFullySpecified),
					string(directorAssessmentObjectivelyDiscoverable),
					string(directorAssessmentMissingUserRequirement),
				},
			),
			"question": map[string]any{
				"type":      "string",
				"maxLength": maxDirectorAssessmentQuestionBytes,
				"description": "One concise outcome-defining question for missing_user_requirement, " +
					"or an empty string for every other basis.",
			},
		}, []string{"basis", "question"}),
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

		if payload.Basis == directorAssessmentMissingUserRequirement {
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
		if basis == directorAssessmentMissingUserRequirement {
			return SettaToolReceipt{
				Tool:    tool.Name,
				Summary: "This call did not run. Work is waiting for the user's answer; ask the recorded question and call no other tool.",
			}, nil
		}
		return tool.Handler(ctx, arguments)
	}
}

func (arguments directorAssessmentArguments) validate() error {
	switch arguments.Basis {
	case directorAssessmentNonWorkOrControl,
		directorAssessmentFullySpecified,
		directorAssessmentObjectivelyDiscoverable:
		if arguments.Question != "" {
			return fmt.Errorf("basis %s requires an empty question", arguments.Basis)
		}
		return nil
	case directorAssessmentMissingUserRequirement:
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
