package projectfile

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/setta/local-backend/strictjson"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func encodeDiskParameterUI(ui aggregate.ParameterUI) (diskParameterUI, error) {
	configuration, err := ui.Configuration()
	if err != nil {
		return diskParameterUI{}, err
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
	result, destination := aggregate.NewEmptyParameterUI(aggregate.ParameterUIType(uiType))
	if destination == nil {
		return aggregate.ParameterUI{}, invalidFile("%s type %q is unsupported", label, uiType)
	}
	if err := decodeExactUIConfiguration(fields["configuration"], destination, label); err != nil {
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
	if err := strictjson.Decode(raw, destination); err != nil {
		return invalidFile("%s configuration is invalid: %v", label, err)
	}
	return nil
}
