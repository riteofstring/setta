package aggregate

import (
	"errors"
	"fmt"
	"sort"
)

func newProviderParameters(
	signature []ProviderParameter,
	nextID IDGenerator,
	claimed map[string]struct{},
) ([]Parameter, error) {
	if len(signature) > maxParametersPerCallable {
		return nil, errors.Join(ErrProviderSignatureInvalid, validationError("provider signature has too many parameters"))
	}
	if err := validateProviderSignature(signature); err != nil {
		return nil, errors.Join(ErrProviderSignatureInvalid, err)
	}
	return allocateProviderParameters(signature, nextID, claimed)
}

func validateProviderSignature(signature []ProviderParameter) error {
	names := make(map[string]struct{}, len(signature))
	for parameterIndex, parameter := range signature {
		if err := validateProviderParameterInput(parameterIndex, parameter, names); err != nil {
			return err
		}
	}
	return validateProviderPassingStyleSequence(signature)
}

func validateProviderPassingStyleSequence(signature []ProviderParameter) error {
	previousRank := -1
	variadicPositionalSeen := false
	variadicKeywordSeen := false
	for parameterIndex, parameter := range signature {
		rank := providerPassingStyleRank(parameter.PassingStyle)
		if rank < previousRank {
			return validationError("provider parameter %d has an invalid passing-style order", parameterIndex)
		}
		switch parameter.PassingStyle {
		case PassingStyleVariadicPositional:
			if variadicPositionalSeen {
				return validationError("provider parameter %d repeats variadic-positional style", parameterIndex)
			}
			variadicPositionalSeen = true
		case PassingStyleVariadicKeyword:
			if variadicKeywordSeen {
				return validationError("provider parameter %d repeats variadic-keyword style", parameterIndex)
			}
			variadicKeywordSeen = true
		}
		previousRank = rank
	}
	return nil
}

func providerPassingStyleRank(style PassingStyle) int {
	switch style {
	case PassingStylePositionalOnly:
		return 0
	case PassingStylePositionalOrKeyword:
		return 1
	case PassingStyleVariadicPositional:
		return 2
	case PassingStyleKeywordOnly:
		return 3
	case PassingStyleVariadicKeyword:
		return 4
	default:
		return -1
	}
}

func validateProviderParameterInput(index int, parameter ProviderParameter, names map[string]struct{}) error {
	name, err := canonicalParameterName(parameter.Name)
	if err != nil || name == "" {
		return fmt.Errorf("provider parameter %d: %w", index, validationError("name is invalid"))
	}
	if err := claimProviderName(names, name, index); err != nil {
		return err
	}
	if !isSupportedPassingStyle(parameter.PassingStyle) {
		return validationError("provider parameter %d has unsupported passing style %q", index, parameter.PassingStyle)
	}
	if parameter.TypeAnnotation != nil {
		if err := validateMetadata("type annotation", *parameter.TypeAnnotation); err != nil {
			return fmt.Errorf("provider parameter %d: %w", index, err)
		}
	}
	if err := validateProviderDefault(parameter.Default); err != nil {
		return fmt.Errorf("provider parameter %d: %w", index, err)
	}
	return nil
}

func claimProviderName(names map[string]struct{}, name string, index int) error {
	if _, exists := names[name]; exists {
		return validationError("provider parameter %d repeats name %q", index, name)
	}
	names[name] = struct{}{}
	return nil
}

func validateProviderDefault(defaultValue *string) error {
	if defaultValue == nil {
		return nil
	}
	return validateMetadata("default", *defaultValue)
}

func allocateProviderParameters(
	signature []ProviderParameter,
	nextID IDGenerator,
	claimed map[string]struct{},
) ([]Parameter, error) {
	parameters := make([]Parameter, 0, len(signature))
	for parameterIndex, providerParameter := range signature {
		id, err := newStableID(nextID, claimed)
		if err != nil {
			return nil, err
		}
		claimed[id] = struct{}{}
		name, _ := canonicalParameterName(providerParameter.Name)
		ordinal := parameterIndex
		parameters = append(parameters, Parameter{
			ID:              id,
			Name:            name,
			NameEditable:    false,
			PassingStyle:    providerParameter.PassingStyle,
			TypeAnnotation:  cloneString(providerParameter.TypeAnnotation),
			Default:         cloneString(providerParameter.Default),
			ProviderOrdinal: &ordinal,
		})
	}
	return parameters, nil
}

func validatePersistedParameter(parameter Parameter) error {
	if err := validateParameterExpression(parameter.AuthoredExpression); err != nil {
		return err
	}
	if parameter.NameEditable {
		return validateAppAuthoredParameter(parameter)
	}
	return validateProviderDerivedParameter(parameter)
}

func validateAppAuthoredParameter(parameter Parameter) error {
	if parameter.PassingStyle != PassingStylePositionalOrKeyword {
		return validationError("app-authored parameter has noncanonical passing style")
	}
	if parameter.TypeAnnotation != nil || parameter.Default != nil || parameter.ProviderOrdinal != nil {
		return validationError("app-authored parameter has provider metadata")
	}
	name, err := canonicalParameterName(parameter.Name)
	if err != nil {
		return err
	}
	if name != parameter.Name {
		return validationError("app-authored parameter name must be canonical")
	}
	return nil
}

func validateProviderDerivedParameter(parameter Parameter) error {
	if parameter.ProviderOrdinal == nil || *parameter.ProviderOrdinal < 0 {
		return validationError("provider-derived parameter has invalid provider ordinal")
	}
	if parameter.TypeAnnotation != nil {
		if err := validateMetadata("type annotation", *parameter.TypeAnnotation); err != nil {
			return err
		}
	}
	if err := validateProviderDefault(parameter.Default); err != nil {
		return err
	}
	if !isSupportedPassingStyle(parameter.PassingStyle) {
		return validationError("provider-derived parameter has unsupported passing style %q", parameter.PassingStyle)
	}
	return validateCanonicalProviderName(parameter.Name)
}

func validateCanonicalProviderName(value string) error {
	name, err := canonicalParameterName(value)
	if err != nil || name == "" {
		return validationError("provider-derived parameter name is invalid")
	}
	if name != value {
		return validationError("provider-derived parameter name must be canonical")
	}
	return nil
}

func validateExpressedPositionalPrefix(parameters []Parameter) error {
	ordinals := make([]int, 0, len(parameters))
	for _, parameter := range parameters {
		if parameter.NameEditable || parameter.PassingStyle != PassingStylePositionalOnly || parameter.AuthoredExpression == "" {
			continue
		}
		if parameter.ProviderOrdinal == nil {
			return validationError("expressed positional-only parameter has no provider ordinal")
		}
		ordinals = append(ordinals, *parameter.ProviderOrdinal)
	}
	sort.Ints(ordinals)
	for index, ordinal := range ordinals {
		if ordinal != index {
			return validationError("expressed positional-only provider ordinals must be a leading contiguous prefix")
		}
	}
	return nil
}

func sameParameters(left []Parameter, right []Parameter) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !sameParameter(left[index], right[index]) {
			return false
		}
	}
	return true
}

func sameParameter(left Parameter, right Parameter) bool {
	return left.ID == right.ID &&
		left.Name == right.Name &&
		left.NameEditable == right.NameEditable &&
		left.PassingStyle == right.PassingStyle &&
		sameString(left.TypeAnnotation, right.TypeAnnotation) &&
		sameString(left.Default, right.Default) &&
		sameInt(left.ProviderOrdinal, right.ProviderOrdinal) &&
		left.AuthoredExpression == right.AuthoredExpression
}
