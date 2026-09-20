package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/setta/local-backend/strictjson"
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

func DefaultParameterUIV2(uiType ParameterUITypeV2) (ParameterUIV2, error) {
	aggregateType := aggregate.ParameterUIType(uiType)
	value := aggregate.DefaultParameterUI(aggregateType)
	if value.Type != aggregateType {
		return ParameterUIV2{}, fmt.Errorf("parameter UI type %q is unsupported", uiType)
	}
	return NewParameterUIV2(value)
}

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
	configuration, err := ui.Configuration()
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
	uiType := aggregate.ParameterUIType(ui.Type)
	result, destination := aggregate.NewEmptyParameterUI(uiType)
	if destination == nil {
		return aggregate.ParameterUI{}, fmt.Errorf("parameter UI type %q is unsupported", ui.Type)
	}
	if err := decodeExactParameterUIConfiguration(ui.Configuration, destination); err != nil {
		return aggregate.ParameterUI{}, err
	}
	if err := result.Validate(); err != nil {
		return aggregate.ParameterUI{}, err
	}
	return result, nil
}

func decodeExactParameterUIConfiguration(content json.RawMessage, destination any) error {
	if err := strictjson.Decode(content, destination); err != nil {
		return fmt.Errorf("parameter UI configuration is invalid: %w", err)
	}
	return nil
}
