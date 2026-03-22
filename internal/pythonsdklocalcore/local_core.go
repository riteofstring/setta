package pythonsdklocalcore

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"setta/internal/buildinfo"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
)

const ProtocolVersion = 1
const CommandListenerRenderRealtimeDependencyValues = "listener_render_realtime_dependency_values"

type RunOptions struct {
	Stdin  io.Reader
	Stdout io.Writer
}

func Run(options RunOptions) error {
	stdin := options.Stdin
	if stdin == nil {
		stdin = strings.NewReader("")
	}
	stdout := options.Stdout
	if stdout == nil {
		stdout = io.Discard
	}

	encoder := json.NewEncoder(stdout)
	if err := encoder.Encode(buildHandshake()); err != nil {
		return fmt.Errorf("write local core handshake: %w", err)
	}

	decoder := json.NewDecoder(stdin)
	for {
		var envelope pythonsdkcontracts.LocalCoreCommandEnvelope
		if err := decoder.Decode(&envelope); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return fmt.Errorf("decode local core command: %w", err)
		}
		if err := encoder.Encode(executeCommand(envelope)); err != nil {
			return fmt.Errorf("write local core result: %w", err)
		}
	}
}

func buildHandshake() pythonsdkcontracts.LocalCoreVersionHandshake {
	sdkVersion := buildinfo.HostPackageVersion()
	coreVersion := buildinfo.Version()
	return pythonsdkcontracts.LocalCoreVersionHandshake{
		ProtocolVersion:    ProtocolVersion,
		SDKVersion:         &sdkVersion,
		CoreVersion:        &coreVersion,
		SDKContractVersion: pythonsdkcontracts.SDKContractVersion,
	}
}

func executeCommand(
	envelope pythonsdkcontracts.LocalCoreCommandEnvelope,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	result := pythonsdkcontracts.LocalCoreResultEnvelope{
		CallID: envelope.CallID,
	}
	switch envelope.CommandName {
	case CommandListenerRenderRealtimeDependencyValues:
		payload, err := decodeRenderRealtimeDependencyValuesRequest(envelope.Payload)
		if err != nil {
			result.Error = stringPointer(err.Error())
			return result
		}
		values, err := realtime.BuildListenerRealtimeDependencyValuesFromSDKContracts(
			payload.DependencyCatalog,
			payload.CurrentDependencyValues,
			payload.Deltas,
		)
		if err != nil {
			result.Error = stringPointer(err.Error())
			return result
		}
		result.OK = true
		result.Result = pythonsdkcontracts.LocalCoreRenderRealtimeDependencyValuesResult{
			DependencyValues: values,
		}
		return result
	default:
		result.Error = stringPointer(
			fmt.Sprintf("unknown local core command %q", envelope.CommandName),
		)
		return result
	}
}

func decodeRenderRealtimeDependencyValuesRequest(
	payload map[string]any,
) (pythonsdkcontracts.LocalCoreRenderRealtimeDependencyValuesRequest, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return pythonsdkcontracts.LocalCoreRenderRealtimeDependencyValuesRequest{}, fmt.Errorf(
			"encode local core payload: %w",
			err,
		)
	}
	var request pythonsdkcontracts.LocalCoreRenderRealtimeDependencyValuesRequest
	if err := json.Unmarshal(encoded, &request); err != nil {
		return pythonsdkcontracts.LocalCoreRenderRealtimeDependencyValuesRequest{}, fmt.Errorf(
			"decode local core payload: %w",
			err,
		)
	}
	return request, nil
}

func stringPointer(value string) *string {
	return &value
}
