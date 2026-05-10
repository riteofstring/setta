package projectstate

import (
	"context"
	"strings"

	"setta/internal/watchcode"
)

func watchCodeParsedSignatureResults(callables []watchcode.CallableInfo) map[string]CallableSignatureResult {
	if len(callables) == 0 {
		return nil
	}

	output := make(map[string]CallableSignatureResult, len(callables))
	for _, callable := range callables {
		output[callable.Identity] = CallableSignatureResult{
			Status: SignatureHelpStatusMatched,
			Params: watchCodeParamProposals(callable),
		}
	}
	return output
}

func watchCodeParamProposals(callable watchcode.CallableInfo) []CallableParamProposal {
	proposals := make([]CallableParamProposal, 0, len(callable.Params))
	for _, param := range callable.Params {
		proposals = append(proposals, CallableParamProposal{
			Name:           strings.TrimSpace(param.Name),
			DefaultValue:   strings.TrimSpace(param.DefaultValue),
			TypeAnnotation: strings.TrimSpace(param.TypeAnnotation),
			PassingStyle:   strings.TrimSpace(param.PassingStyle),
		})
	}
	return proposals
}

func wrapWatchCodeParsedSignatureResolver(
	callableName string,
	parsedSignature CallableSignatureResult,
	fallback CallableSignatureResolver,
) CallableSignatureResolver {
	if parsedSignature.Status != SignatureHelpStatusMatched {
		return fallback
	}
	return watchCodeParsedSignatureResolver{
		callableName:     strings.TrimSpace(callableName),
		parsedSignature:  parsedSignature,
		fallbackResolver: fallback,
	}
}

type watchCodeParsedSignatureResolver struct {
	callableName     string
	parsedSignature  CallableSignatureResult
	fallbackResolver CallableSignatureResolver
}

func (r watchCodeParsedSignatureResolver) recordFinalStatus(callableName string, status SignatureHelpStatus) {
	recorder, ok := r.fallbackResolver.(CallableSignatureStatusRecorder)
	if !ok {
		return
	}
	recorder.RecordCallableSignatureStatus(callableName, status)
}

func (r watchCodeParsedSignatureResolver) ResolveCallableSignature(
	ctx context.Context,
	project Project,
	sectionID string,
	callableName string,
) (CallableSignatureResult, bool, error) {
	trimmedCallableName := strings.TrimSpace(callableName)
	if trimmedCallableName == "" {
		return CallableSignatureResult{}, false, nil
	}
	if trimmedCallableName != r.callableName {
		if r.fallbackResolver == nil {
			return CallableSignatureResult{}, false, nil
		}
		return r.fallbackResolver.ResolveCallableSignature(ctx, project, sectionID, callableName)
	}

	if r.fallbackResolver == nil {
		return r.parsedSignature, true, nil
	}

	result, ok, err := r.fallbackResolver.ResolveCallableSignature(ctx, project, sectionID, callableName)
	if err != nil {
		return CallableSignatureResult{}, false, err
	}
	if !ok {
		r.recordFinalStatus(trimmedCallableName, r.parsedSignature.Status)
		return r.parsedSignature, true, nil
	}
	if result.Status != SignatureHelpStatusMatched || !sameCallableParamNames(result.Params, r.parsedSignature.Params) {
		parsedResult := r.parsedSignature
		if strings.TrimSpace(result.Documentation) != "" {
			parsedResult.Documentation = result.Documentation
		}
		r.recordFinalStatus(trimmedCallableName, parsedResult.Status)
		return parsedResult, true, nil
	}
	r.recordFinalStatus(trimmedCallableName, result.Status)
	return result, true, nil
}

func sameCallableParamNames(left []CallableParamProposal, right []CallableParamProposal) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if strings.TrimSpace(left[index].Name) != strings.TrimSpace(right[index].Name) {
			return false
		}
	}
	return true
}
