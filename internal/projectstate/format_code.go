package projectstate

import (
	"errors"
)

const (
	FormatCodeTargetKindCode            = "code"
	FormatCodeTargetKindGeneratedPython = "generated_python"
)

type FormatCodeTarget struct {
	Kind          string
	Code          string
	ReadOnly      bool
	GenCodePrefix string
	GenCodeSuffix string
}

type formatCodeError struct {
	message string
}

func (e *formatCodeError) Error() string {
	return e.message
}

func NewFormatCodeError(message string) error {
	if message == "" {
		message = "Formatting failed."
	}
	return &formatCodeError{message: message}
}

func IsFormatCodeError(err error) bool {
	var target *formatCodeError
	return errors.As(err, &target)
}

func (d Document) ResolveFormatCodeTarget(projectID string, sectionID string) (FormatCodeTarget, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return FormatCodeTarget{}, err
	}
	return project.ResolveFormatCodeTarget(sectionID)
}

func (p Project) ResolveFormatCodeTarget(sectionID string) (FormatCodeTarget, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return FormatCodeTarget{}, err
	}

	if impl.IsCode() && impl.Code != nil && impl.Code.Language == CodeLanguagePython {
		payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
		if err != nil {
			return FormatCodeTarget{}, err
		}
		return FormatCodeTarget{
			Kind:     FormatCodeTargetKindCode,
			Code:     payloadRawStringField(payload, "code"),
			ReadOnly: effectiveCodeSectionBindingAccessMode(payload, impl.Code.Binding) == CodeFileAccessModeReadOnly,
		}, nil
	}

	if impl.IsGenerated() && impl.Generated != nil && impl.Generated.Kind == GeneratedSectionKindPythonCode {
		config, ok, err := p.PythonCodegenTarget()
		if err != nil {
			return FormatCodeTarget{}, err
		}
		if !ok {
			return FormatCodeTarget{}, ErrProjectCodegenPythonTargetMissing
		}
		return FormatCodeTarget{
			Kind:          FormatCodeTargetKindGeneratedPython,
			GenCodePrefix: config.GenCodePrefix,
			GenCodeSuffix: config.GenCodeSuffix,
		}, nil
	}

	return FormatCodeTarget{}, NewFormatCodeError("Format code only supports Python code sections.")
}
