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
	payload := make(map[string]any, len(r.fieldSet))
	storeProvidedField(payload, r.fieldSet, "workspaceRoot", r.WorkspaceRoot)
	storeProvidedField(payload, r.fieldSet, "profile", r.Profile)
	storeProvidedField(payload, r.fieldSet, "settaHome", r.SettaHome)
	storeProvidedField(payload, r.fieldSet, "settaFilesRoot", r.SettaFilesRoot)
	storeProvidedField(payload, r.fieldSet, "settaFilesLocation", r.SettaFilesLocation)
	storeProvidedField(payload, r.fieldSet, "runtimeRoot", r.RuntimeRoot)
	storeProvidedField(payload, r.fieldSet, "sshTarget", r.SSHTarget)
	storeProvidedField(payload, r.fieldSet, "sshArgs", r.SSHArgs)
	storeProvidedField(payload, r.fieldSet, "remoteCmd", r.RemoteCmd)
	storeProvidedField(payload, r.fieldSet, "localPort", r.LocalPort)
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

func storeProvidedField[T any](payload map[string]any, fieldSet map[string]struct{}, fieldName string, value *T) {
	if _, ok := fieldSet[fieldName]; !ok {
		return
	}
	if value == nil {
		payload[fieldName] = nil
		return
	}
	payload[fieldName] = *value
}
