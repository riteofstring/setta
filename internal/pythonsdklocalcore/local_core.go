package pythonsdklocalcore

import (
	"encoding/base64"
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

type renderRealtimeDependencyValuesRequest struct {
	DependencyCatalog       realtime.ListenerDependencyCatalog        `json:"dependencyCatalog"`
	CurrentDependencyValues realtime.ListenerRenderedDependencyValues `json:"currentDependencyValues"`
	Deltas                  []localCoreRealtimeDeltaWire              `json:"deltas"`
}

type localCoreRealtimeDeltaWire struct {
	Dependency          json.RawMessage `json:"dependency"`
	Value               json.RawMessage `json:"value"`
	BinaryPayloadBase64 string          `json:"binaryPayloadBase64,omitempty"`
}

type renderRealtimeDependencyValuesResultWire struct {
	DependencyValues realtime.ListenerRenderedDependencyValues `json:"dependencyValues"`
}

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
		deltas, err := payload.realtimeDeltas()
		if err != nil {
			result.Error = stringPointer(err.Error())
			return result
		}
		values, err := realtime.BuildListenerRealtimeDependencyValuesFromCatalog(
			payload.DependencyCatalog,
			payload.CurrentDependencyValues,
			deltas,
		)
		if err != nil {
			result.Error = stringPointer(err.Error())
			return result
		}
		result.OK = true
		result.Result = renderRealtimeDependencyValuesResultWire{
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
) (renderRealtimeDependencyValuesRequest, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return renderRealtimeDependencyValuesRequest{}, fmt.Errorf(
			"encode local core payload: %w",
			err,
		)
	}
	var request renderRealtimeDependencyValuesRequest
	if err := json.Unmarshal(encoded, &request); err != nil {
		return renderRealtimeDependencyValuesRequest{}, fmt.Errorf(
			"decode local core payload: %w",
			err,
		)
	}
	return request, nil
}

func (r renderRealtimeDependencyValuesRequest) realtimeDeltas() ([]realtime.ListenerRealtimeDelta, error) {
	deltas := make([]realtime.ListenerRealtimeDelta, 0, len(r.Deltas))
	for _, delta := range r.Deltas {
		dependency, err := realtime.CanonicalDependencyKeyFromWire(delta.Dependency)
		if err != nil {
			return nil, fmt.Errorf("decode local core dependency key: %w", err)
		}
		next := realtime.ListenerRealtimeDelta{
			Dependency: dependency,
			Value:      append(json.RawMessage(nil), delta.Value...),
		}
		if strings.TrimSpace(delta.BinaryPayloadBase64) != "" {
			payload, err := base64.StdEncoding.DecodeString(
				strings.TrimSpace(delta.BinaryPayloadBase64),
			)
			if err != nil {
				return nil, fmt.Errorf("decode local core binary payload: %w", err)
			}
			next.BinaryPayload = payload
		}
		deltas = append(deltas, next)
	}
	return deltas, nil
}

func stringPointer(value string) *string {
	return &value
}
