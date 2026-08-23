package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

type ParameterUITypeV2 string

const (
	ParameterUITypeCodeV2     ParameterUITypeV2 = "CodeParam"
	ParameterUITypeTextV2     ParameterUITypeV2 = "TextParam"
	ParameterUITypeDateV2     ParameterUITypeV2 = "DateParam"
	ParameterUITypeTimeV2     ParameterUITypeV2 = "TimeParam"
	ParameterUITypeSliderV2   ParameterUITypeV2 = "SliderParam"
	ParameterUITypeRotaryV2   ParameterUITypeV2 = "RotaryParam"
	ParameterUITypeSwitchV2   ParameterUITypeV2 = "SwitchParam"
	ParameterUITypeColorV2    ParameterUITypeV2 = "ColorPickerParam"
	ParameterUITypeDropdownV2 ParameterUITypeV2 = "DropdownParam"
	ParameterUITypePasswordV2 ParameterUITypeV2 = "PasswordParam"
	ParameterUITypeTextAreaV2 ParameterUITypeV2 = "TextAreaParam"
	ParameterUITypeDropzoneV2 ParameterUITypeV2 = "DropzoneParam"
	ParameterUITypeNestedV2   ParameterUITypeV2 = "NestedParam"
)

// ParameterUITypesV2 returns the complete closed V2 UI vocabulary in its
// stable publication order.
func ParameterUITypesV2() []ParameterUITypeV2 {
	return []ParameterUITypeV2{
		ParameterUITypeCodeV2,
		ParameterUITypeTextV2,
		ParameterUITypeDateV2,
		ParameterUITypeTimeV2,
		ParameterUITypeSliderV2,
		ParameterUITypeRotaryV2,
		ParameterUITypeSwitchV2,
		ParameterUITypeColorV2,
		ParameterUITypeDropdownV2,
		ParameterUITypePasswordV2,
		ParameterUITypeTextAreaV2,
		ParameterUITypeDropzoneV2,
		ParameterUITypeNestedV2,
	}
}

// DefaultParameterUIV2 projects the authoritative aggregate default for one
// supported UI type into its complete strict V2 envelope.
func DefaultParameterUIV2(uiType ParameterUITypeV2) (ParameterUIV2, error) {
	aggregateType := aggregate.ParameterUIType(uiType)
	value := aggregate.DefaultParameterUI(aggregateType)
	if value.Type != aggregateType {
		return ParameterUIV2{}, fmt.Errorf("parameter UI type %q is unsupported", uiType)
	}
	return NewParameterUIV2(value)
}

// ParameterUIV2 is the strict transport envelope for one complete parameter
// presentation. Configuration is decoded exactly once into an aggregate type
// before a mutation crosses the HTTP boundary.
type ParameterUIV2 struct {
	Type          ParameterUITypeV2 `json:"type"`
	Configuration json.RawMessage   `json:"configuration"`
}

func (ui *ParameterUIV2) UnmarshalJSON(content []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(content, &fields); err != nil {
		return err
	}
	if len(fields) != 2 || fields["type"] == nil || fields["configuration"] == nil {
		return fmt.Errorf("parameter UI must contain exactly type and configuration")
	}
	var uiType ParameterUITypeV2
	if err := json.Unmarshal(fields["type"], &uiType); err != nil || uiType == "" {
		return fmt.Errorf("parameter UI type is invalid")
	}
	configuration := bytes.TrimSpace(fields["configuration"])
	if len(configuration) == 0 || bytes.Equal(configuration, []byte("null")) || configuration[0] != '{' {
		return fmt.Errorf("parameter UI configuration must be an object")
	}
	candidate := ParameterUIV2{Type: uiType, Configuration: append(json.RawMessage(nil), configuration...)}
	if _, err := candidate.Aggregate(); err != nil {
		return err
	}
	*ui = candidate
	return nil
}

func NewParameterUIV2(ui aggregate.ParameterUI) (ParameterUIV2, error) {
	configuration, err := parameterUIConfiguration(ui)
	if err != nil {
		return ParameterUIV2{}, err
	}
	encoded, err := json.Marshal(configuration)
	if err != nil {
		return ParameterUIV2{}, fmt.Errorf("encode parameter UI configuration: %w", err)
	}
	return ParameterUIV2{Type: ParameterUITypeV2(ui.Type), Configuration: encoded}, nil
}

func (ui ParameterUIV2) Aggregate() (aggregate.ParameterUI, error) {
	var result aggregate.ParameterUI
	result.Type = aggregate.ParameterUIType(ui.Type)
	switch result.Type {
	case aggregate.ParameterUITypeCode:
		result.Code = new(aggregate.CodeUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Code); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeText:
		result.Text = new(aggregate.TextUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Text); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeTextArea:
		result.TextArea = new(aggregate.TextAreaUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.TextArea); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeSwitch:
		result.Switch = new(aggregate.SwitchUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Switch); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeDropdown:
		result.Dropdown = new(aggregate.DropdownUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Dropdown); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeColor:
		result.Color = new(aggregate.ColorUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Color); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeSlider, aggregate.ParameterUITypeRotary:
		result.Numeric = new(aggregate.NumericUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Numeric); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypePassword:
		result.Password = new(aggregate.PasswordUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Password); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeDate:
		result.Date = new(aggregate.DateUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Date); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeTime:
		result.Time = new(aggregate.TimeUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Time); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeDropzone:
		result.Dropzone = new(aggregate.DropzoneUIConfiguration)
		if err := decodeExactParameterUIConfiguration(ui.Configuration, result.Dropzone); err != nil {
			return aggregate.ParameterUI{}, err
		}
	case aggregate.ParameterUITypeNested:
		var empty struct{}
		if err := decodeExactParameterUIConfiguration(ui.Configuration, &empty); err != nil {
			return aggregate.ParameterUI{}, err
		}
	default:
		return aggregate.ParameterUI{}, fmt.Errorf("parameter UI type %q is unsupported", ui.Type)
	}
	if err := result.Validate(); err != nil {
		return aggregate.ParameterUI{}, err
	}
	return result, nil
}

func parameterUIConfiguration(ui aggregate.ParameterUI) (any, error) {
	if err := ui.Validate(); err != nil {
		return nil, err
	}
	switch ui.Type {
	case aggregate.ParameterUITypeCode:
		return ui.Code, nil
	case aggregate.ParameterUITypeText:
		return ui.Text, nil
	case aggregate.ParameterUITypeTextArea:
		return ui.TextArea, nil
	case aggregate.ParameterUITypeSwitch:
		return ui.Switch, nil
	case aggregate.ParameterUITypeDropdown:
		return ui.Dropdown, nil
	case aggregate.ParameterUITypeColor:
		return ui.Color, nil
	case aggregate.ParameterUITypeSlider, aggregate.ParameterUITypeRotary:
		return ui.Numeric, nil
	case aggregate.ParameterUITypePassword:
		return ui.Password, nil
	case aggregate.ParameterUITypeDate:
		return ui.Date, nil
	case aggregate.ParameterUITypeTime:
		return ui.Time, nil
	case aggregate.ParameterUITypeDropzone:
		return ui.Dropzone, nil
	case aggregate.ParameterUITypeNested:
		return struct{}{}, nil
	default:
		return nil, fmt.Errorf("parameter UI type %q is unsupported", ui.Type)
	}
}

func decodeExactParameterUIConfiguration(content json.RawMessage, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("parameter UI configuration is invalid: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("parameter UI configuration must contain one JSON value")
	}
	return nil
}
