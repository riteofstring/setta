package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrPasswordParamRequired       = errors.New("code object must resolve to a password param")
	ErrPasswordSecretStoreRequired = errors.New("password param read requires password secret store")
)

func (d Document) GetPasswordParamValue(projectID string, sectionID string, codeObjID string) (string, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", err
	}
	return project.GetPasswordParamValue(sectionID, codeObjID)
}

func (r *Runtime) GetPasswordParamValue(ctx context.Context, projectID string, sectionID string, codeObjID string) (string, error) {
	if r == nil {
		return "", ErrRuntimeClosed
	}

	var value string
	_, err := r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			nextValue, err := state.current.GetPasswordParamValue(projectID, sectionID, codeObjID)
			if err != nil {
				return snapshotFromState(*state), err
			}
			value = nextValue
			return snapshotFromState(*state), nil
		},
	})
	if err != nil {
		return "", err
	}
	return value, nil
}

func (p Project) GetPasswordParamValue(sectionID string, codeObjID string) (string, error) {
	payload, _, _, impl, err := p.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		return "", err
	}

	codeObjType := effectiveCodeObjType(payload, impl)
	if codeObjType != "PasswordParam" {
		return "", fmt.Errorf("%w: %q (%s)", ErrPasswordParamRequired, strings.TrimSpace(codeObjID), codeObjType)
	}
	if p.passwordSecrets == nil {
		return "", ErrPasswordSecretStoreRequired
	}
	return p.passwordSecrets.Get(impl.ID)
}

func (p Project) PasswordSecretsSnapshot() (map[string]string, error) {
	if p.passwordSecrets == nil {
		return map[string]string{}, nil
	}

	secrets := map[string]string{}
	for implID, impl := range p.CodeObjImpls {
		if strings.TrimSpace(impl.Type) != "PasswordParam" {
			continue
		}
		value, err := p.passwordSecrets.Get(implID)
		if err != nil {
			return nil, fmt.Errorf("read password secret %q: %w", implID, err)
		}
		if value == "" {
			continue
		}
		secrets[implID] = value
	}
	return secrets, nil
}
