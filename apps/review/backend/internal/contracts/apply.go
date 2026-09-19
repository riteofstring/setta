package contracts

import (
	"encoding/json"
	"errors"
	"fmt"
)

func ApplyMutation(snapshot ReviewSnapshot, mutation ReviewMutation) (ReviewSnapshot, error) {
	if err := snapshot.Validate(); err != nil {
		return ReviewSnapshot{}, err
	}
	if err := mutation.Validate(); err != nil {
		return ReviewSnapshot{}, err
	}
	if mutation.ProjectID != snapshot.Project.ID {
		return ReviewSnapshot{}, errors.New("contracts: project identity conflict")
	}
	if mutation.ExpectedRevision != snapshot.Revision {
		return ReviewSnapshot{}, errors.New("contracts: project revision conflict")
	}
	candidate, err := cloneSnapshot(snapshot)
	if err != nil {
		return ReviewSnapshot{}, err
	}
	for index, raw := range mutation.Operations {
		if err := applyOperation(&candidate, raw); err != nil {
			return ReviewSnapshot{}, fmt.Errorf("contracts: operation %d: %w", index, err)
		}
	}
	candidate.Revision++
	if err := candidate.Validate(); err != nil {
		return ReviewSnapshot{}, err
	}
	return candidate, nil
}

func cloneSnapshot(snapshot ReviewSnapshot) (ReviewSnapshot, error) {
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return ReviewSnapshot{}, fmt.Errorf("contracts: clone snapshot: %w", err)
	}
	var candidate ReviewSnapshot
	if err := DecodeStrict(encoded, &candidate); err != nil {
		return ReviewSnapshot{}, fmt.Errorf("contracts: clone snapshot: %w", err)
	}
	return candidate, nil
}

func applyOperation(snapshot *ReviewSnapshot, raw json.RawMessage) error {
	var discriminator struct {
		Operation string `json:"op"`
	}
	if err := json.Unmarshal(raw, &discriminator); err != nil {
		return err
	}
	switch discriminator.Operation {
	case "importAssessment":
		var operation ImportAssessmentOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		return importAssessment(snapshot, operation.Assessment)
	case "setResponse":
		var operation SetResponseOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		return setResponse(snapshot, operation.Response)
	case "deleteResponse":
		var operation DeleteResponseOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		return deleteResponse(snapshot, operation.RequestID)
	default:
		return fmt.Errorf("unsupported operation %q", discriminator.Operation)
	}
}

func importAssessment(snapshot *ReviewSnapshot, assessment ExternalAssessment) error {
	for requestIndex := range snapshot.Requests {
		requestSnapshot := &snapshot.Requests[requestIndex]
		for _, existing := range requestSnapshot.Assessments {
			if existing.ID == assessment.ID {
				return fmt.Errorf("assessment %q already exists", assessment.ID)
			}
		}
		if requestSnapshot.Request.ID == assessment.RequestID {
			requestSnapshot.Assessments = append(requestSnapshot.Assessments, assessment)
			return nil
		}
	}
	return fmt.Errorf("assessment references missing request %q", assessment.RequestID)
}

func setResponse(snapshot *ReviewSnapshot, response ReviewResponse) error {
	for requestIndex := range snapshot.Requests {
		requestSnapshot := &snapshot.Requests[requestIndex]
		if requestSnapshot.Request.ID != response.RequestID {
			continue
		}
		if requestSnapshot.Response != nil && requestSnapshot.Response.ID != response.ID {
			return fmt.Errorf("request %q already has response %q", response.RequestID, requestSnapshot.Response.ID)
		}
		if err := validateResponseForRequest(response, requestSnapshot.Request, requestSnapshot.SHA256); err != nil {
			return err
		}
		requestSnapshot.Response = &response
		return nil
	}
	return fmt.Errorf("response references missing request %q", response.RequestID)
}

func deleteResponse(snapshot *ReviewSnapshot, requestID string) error {
	for requestIndex := range snapshot.Requests {
		requestSnapshot := &snapshot.Requests[requestIndex]
		if requestSnapshot.Request.ID != requestID {
			continue
		}
		if requestSnapshot.Response == nil {
			return fmt.Errorf("request %q has no response", requestID)
		}
		requestSnapshot.Response = nil
		return nil
	}
	return fmt.Errorf("response references missing request %q", requestID)
}
