package projectfile

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func encodeDiskParameterUI(ui aggregate.ParameterUI) (diskParameterUI, error) {
	if err := ui.Validate(); err != nil {
		return diskParameterUI{}, err
	}
	var configuration any
	switch ui.Type {
	case aggregate.ParameterUITypeCode:
		configuration = ui.Code
	case aggregate.ParameterUITypeText:
		configuration = ui.Text
	case aggregate.ParameterUITypeTextArea:
		configuration = ui.TextArea
	case aggregate.ParameterUITypeSwitch:
		configuration = ui.Switch
	case aggregate.ParameterUITypeDropdown:
		configuration = ui.Dropdown
	case aggregate.ParameterUITypeColor:
		configuration = ui.Color
	case aggregate.ParameterUITypeSlider, aggregate.ParameterUITypeRotary:
		configuration = ui.Numeric
	case aggregate.ParameterUITypePassword:
		configuration = ui.Password
	case aggregate.ParameterUITypeDate:
		configuration = ui.Date
	case aggregate.ParameterUITypeTime:
		configuration = ui.Time
	case aggregate.ParameterUITypeDropzone:
		configuration = ui.Dropzone
	case aggregate.ParameterUITypeNested:
		configuration = struct{}{}
	default:
		return diskParameterUI{}, fmt.Errorf("unsupported parameter UI type %q", ui.Type)
	}
	encoded, err := json.Marshal(configuration)
	if err != nil {
		return diskParameterUI{}, err
	}
	return diskParameterUI{Type: string(ui.Type), Configuration: encoded}, nil
}

func decodeParameterUIOverrides(raw json.RawMessage) (map[string]aggregate.ParameterUI, error) {
	fields, err := decodeObject(raw, "parameterUIOverrides")
	if err != nil {
		return nil, err
	}
	result := make(map[string]aggregate.ParameterUI, len(fields))
	for targetID, value := range fields {
		ui, err := decodeDiskParameterUI(value, fmt.Sprintf("parameterUIOverrides[%q]", targetID))
		if err != nil {
			return nil, err
		}
		result[targetID] = ui
	}
	return result, nil
}

func decodeDiskParameterUI(raw json.RawMessage, label string) (aggregate.ParameterUI, error) {
	fields, err := decodeObject(raw, label)
	if err != nil {
		return aggregate.ParameterUI{}, err
	}
	if err := requireExactFields(fields, label, "type", "configuration"); err != nil {
		return aggregate.ParameterUI{}, err
	}
	uiType, err := decodeString(fields["type"], label+" type")
	if err != nil {
		return aggregate.ParameterUI{}, err
	}
	result := aggregate.ParameterUI{Type: aggregate.ParameterUIType(uiType)}
	switch result.Type {
	case aggregate.ParameterUITypeCode:
		result.Code = new(aggregate.CodeUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Code, label)
	case aggregate.ParameterUITypeText:
		result.Text = new(aggregate.TextUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Text, label)
	case aggregate.ParameterUITypeTextArea:
		result.TextArea = new(aggregate.TextAreaUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.TextArea, label)
	case aggregate.ParameterUITypeSwitch:
		result.Switch = new(aggregate.SwitchUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Switch, label)
	case aggregate.ParameterUITypeDropdown:
		result.Dropdown = new(aggregate.DropdownUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Dropdown, label)
	case aggregate.ParameterUITypeColor:
		result.Color = new(aggregate.ColorUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Color, label)
	case aggregate.ParameterUITypeSlider, aggregate.ParameterUITypeRotary:
		result.Numeric = new(aggregate.NumericUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Numeric, label)
	case aggregate.ParameterUITypePassword:
		result.Password = new(aggregate.PasswordUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Password, label)
	case aggregate.ParameterUITypeDate:
		result.Date = new(aggregate.DateUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Date, label)
	case aggregate.ParameterUITypeTime:
		result.Time = new(aggregate.TimeUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Time, label)
	case aggregate.ParameterUITypeDropzone:
		result.Dropzone = new(aggregate.DropzoneUIConfiguration)
		err = decodeExactUIConfiguration(fields["configuration"], result.Dropzone, label)
	case aggregate.ParameterUITypeNested:
		err = decodeExactUIConfiguration(fields["configuration"], new(struct{}), label)
	default:
		return aggregate.ParameterUI{}, invalidFile("%s type %q is unsupported", label, uiType)
	}
	if err != nil {
		return aggregate.ParameterUI{}, err
	}
	if err := result.Validate(); err != nil {
		return aggregate.ParameterUI{}, invalidFile("%s is invalid: %v", label, err)
	}
	return result, nil
}

func decodeExactUIConfiguration(raw json.RawMessage, destination any, label string) error {
	if isNull(raw) || len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '{' {
		return invalidFile("%s configuration must be an object", label)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return invalidFile("%s configuration is invalid: %v", label, err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return invalidFile("%s configuration must contain one JSON value", label)
	}
	return nil
}
