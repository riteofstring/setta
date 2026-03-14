package workspacelaunch

import (
	"encoding/json"
	"errors"
	"strings"
)

const launchIntentTokenField = "launchIntentToken"

type Request struct {
	LaunchIntentToken  *string `json:"launchIntentToken"`
	WorkspaceRoot      *string `json:"workspaceRoot"`
	Profile            *string `json:"profile"`
	SettaHome          *string `json:"settaHome"`
	SettaFilesRoot     *string `json:"settaFilesRoot"`
	SettaFilesLocation *string `json:"settaFilesLocation"`
	RuntimeRoot        *string `json:"runtimeRoot"`
	SSHTarget          *string `json:"sshTarget"`
	SSHArgs            *string `json:"sshArgs"`
	RemoteCmd          *string `json:"remoteCmd"`
	LocalPort          *int    `json:"localPort"`

	fieldSet map[string]struct{}
}

func (r *Request) UnmarshalJSON(data []byte) error {
	type requestPayload struct {
		LaunchIntentToken  *string `json:"launchIntentToken"`
		WorkspaceRoot      *string `json:"workspaceRoot"`
		Profile            *string `json:"profile"`
		SettaHome          *string `json:"settaHome"`
		SettaFilesRoot     *string `json:"settaFilesRoot"`
		SettaFilesLocation *string `json:"settaFilesLocation"`
		RuntimeRoot        *string `json:"runtimeRoot"`
		SSHTarget          *string `json:"sshTarget"`
		SSHArgs            *string `json:"sshArgs"`
		RemoteCmd          *string `json:"remoteCmd"`
		LocalPort          *int    `json:"localPort"`
	}

	var decoded requestPayload
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	r.LaunchIntentToken = decoded.LaunchIntentToken
	r.WorkspaceRoot = decoded.WorkspaceRoot
	r.Profile = decoded.Profile
	r.SettaHome = decoded.SettaHome
	r.SettaFilesRoot = decoded.SettaFilesRoot
	r.SettaFilesLocation = decoded.SettaFilesLocation
	r.RuntimeRoot = decoded.RuntimeRoot
	r.SSHTarget = decoded.SSHTarget
	r.SSHArgs = decoded.SSHArgs
	r.RemoteCmd = decoded.RemoteCmd
	r.LocalPort = decoded.LocalPort
	r.fieldSet = make(map[string]struct{}, len(raw))
	for key := range raw {
		r.fieldSet[key] = struct{}{}
	}
	return nil
}

func (r Request) FieldProvided(fieldName string) bool {
	_, ok := r.fieldSet[fieldName]
	return ok
}

func (r Request) ValidateForIntent() error {
	if trimmedStringPointer(r.LaunchIntentToken) != "" {
		return errors.New("launchIntentToken cannot be nested inside launchRequest.")
	}
	if trimmedStringPointer(r.WorkspaceRoot) == "" {
		return errors.New("launchRequest.workspaceRoot is required.")
	}
	return nil
}

func (r Request) StoredPayload() map[string]any {
	payload := map[string]any{}
	if r.FieldProvided("workspaceRoot") {
		payload["workspaceRoot"] = nullableStringValue(r.WorkspaceRoot)
	}
	if r.FieldProvided("profile") {
		payload["profile"] = nullableStringValue(r.Profile)
	}
	if r.FieldProvided("settaHome") {
		payload["settaHome"] = nullableStringValue(r.SettaHome)
	}
	if r.FieldProvided("settaFilesRoot") {
		payload["settaFilesRoot"] = nullableStringValue(r.SettaFilesRoot)
	}
	if r.FieldProvided("settaFilesLocation") {
		payload["settaFilesLocation"] = nullableStringValue(r.SettaFilesLocation)
	}
	if r.FieldProvided("runtimeRoot") {
		payload["runtimeRoot"] = nullableStringValue(r.RuntimeRoot)
	}
	if r.FieldProvided("sshTarget") {
		payload["sshTarget"] = nullableStringValue(r.SSHTarget)
	}
	if r.FieldProvided("sshArgs") {
		payload["sshArgs"] = nullableStringValue(r.SSHArgs)
	}
	if r.FieldProvided("remoteCmd") {
		payload["remoteCmd"] = nullableStringValue(r.RemoteCmd)
	}
	if r.FieldProvided("localPort") {
		if r.LocalPort == nil {
			payload["localPort"] = nil
		} else {
			payload["localPort"] = *r.LocalPort
		}
	}
	return payload
}

func RequestFromStoredPayload(payload map[string]any) (Request, error) {
	if payload == nil {
		payload = map[string]any{}
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return Request{}, err
	}
	var request Request
	if err := json.Unmarshal(data, &request); err != nil {
		return Request{}, err
	}
	return request, nil
}

func trimmedStringPointer(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func nullableStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}
