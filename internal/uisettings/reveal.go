package uisettings

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/projectview"
	"setta/internal/realtime"
)

type FrontendRevealTransport interface {
	Registry() *realtime.Registry
	SendJSON(ctx context.Context, message any, connectionID string) (bool, error)
}

type RevealService interface {
	Reveal(ctx context.Context, input RevealInput) (RevealResult, error)
}

type RevealRequestIDSource func() (string, error)

type RevealInput struct {
	ProjectConfigID       string
	ProjectView           *projectview.SingleConfig
	Registry              *Registry
	SettingID             string
	SectionIDToActivate   string
	ContextSectionID      string
	ChatID                string
	FrontendAffinityToken string
	DurationMS            int
}

type RevealStatus struct {
	SettingID string
	Status    string
	Target    *realtime.UISettingRevealTarget
	Error     *SettingError
}

type RevealResult struct {
	RequestID          string
	ProjectConfigID    string
	DurationMS         int
	EmittedRevealCount int
	Statuses           []RevealStatus
}

type RevealServiceOptions struct {
	Transport       FrontendRevealTransport
	Results         *realtime.UISettingRevealResultHub
	RequestIDSource RevealRequestIDSource
}

type RevealCoordinator struct {
	transport       FrontendRevealTransport
	results         *realtime.UISettingRevealResultHub
	requestIDSource RevealRequestIDSource
}

func NewRevealService(options RevealServiceOptions) (*RevealCoordinator, error) {
	if options.Transport == nil {
		return nil, fmt.Errorf("uisettings: frontend reveal transport is required")
	}
	if options.Transport.Registry() == nil {
		return nil, fmt.Errorf("uisettings: frontend reveal transport registry is required")
	}
	if options.Results == nil {
		return nil, fmt.Errorf("uisettings: reveal result hub is required")
	}
	if options.RequestIDSource == nil {
		options.RequestIDSource = randomRevealRequestID
	}
	return &RevealCoordinator{
		transport:       options.Transport,
		results:         options.Results,
		requestIDSource: options.RequestIDSource,
	}, nil
}

func (c *RevealCoordinator) Reveal(ctx context.Context, input RevealInput) (RevealResult, error) {
	if c == nil {
		return RevealResult{}, fmt.Errorf("uisettings: reveal service is unavailable")
	}

	requestID, err := c.requestIDSource()
	if err != nil {
		return RevealResult{}, err
	}
	result := RevealResult{
		RequestID:       requestID,
		ProjectConfigID: strings.TrimSpace(input.ProjectConfigID),
		DurationMS:      boundRevealDuration(input.DurationMS),
	}
	if input.Registry == nil {
		return result, fmt.Errorf("uisettings: reveal registry is required")
	}
	if input.ProjectView == nil {
		return result, fmt.Errorf("uisettings: project view is required")
	}

	entry, ok, err := input.Registry.Get(input.SettingID)
	if err != nil {
		result.Statuses = []RevealStatus{failedRevealStatus(
			strings.TrimSpace(input.SettingID),
			newSettingError(ErrorCodeMutationFailed, "%s", err.Error()),
		)}
		return result, nil
	}
	if !ok {
		result.Statuses = []RevealStatus{failedRevealStatus(
			strings.TrimSpace(input.SettingID),
			newSettingError(ErrorCodeSettingNotFound, "Unknown setting id: %s", strings.TrimSpace(input.SettingID)),
		)}
		return result, nil
	}

	location := entry.Metadata.Location
	requestedActiveSectionID, resolvedActiveSectionID, err := resolveRevealActiveSection(entry.Metadata, *input.ProjectView, input.SectionIDToActivate, input.ContextSectionID)
	if err != nil {
		result.Statuses = []RevealStatus{failedRevealStatus(entry.Metadata.SettingID, err)}
		return result, nil
	}
	if resolvedActiveSectionID != "" {
		if err := validateRightPaneRevealTarget(*input.ProjectView, resolvedActiveSectionID, location.UIEditorTabName); err != nil {
			result.Statuses = []RevealStatus{failedRevealStatus(entry.Metadata.SettingID, err)}
			return result, nil
		}
	}

	target := buildRevealTarget(entry.Metadata)
	targetFrontendID, affinitySelected, err := c.resolveTargetFrontendID(input.FrontendAffinityToken)
	if err != nil {
		result.Statuses = []RevealStatus{failedRevealStatus(entry.Metadata.SettingID, err)}
		return result, nil
	}

	if err := c.results.RegisterRequest(requestID, realtime.RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID:     targetFrontendID,
		ExpectedProjectConfigID: result.ProjectConfigID,
		ExpectedSettingIDs:      []string{entry.Metadata.SettingID},
	}); err != nil {
		return result, err
	}

	delivered, sendErr := c.transport.SendJSON(ctx, realtime.NewUISettingRevealMessage(realtime.UISettingRevealContent{
		ProjectConfigID: result.ProjectConfigID,
		ChatID:          stringPointerIfNotBlank(input.ChatID),
		ActiveSectionID: stringPointerIfNotBlank(requestedActiveSectionID),
		Reveals:         []realtime.UISettingRevealTarget{target},
		DurationMS:      result.DurationMS,
		RequestID:       requestID,
	}), targetFrontendID)
	if sendErr != nil {
		c.results.CancelRequest(requestID)
		return result, sendErr
	}
	if !delivered {
		c.results.CancelRequest(requestID)
		if affinitySelected {
			result.Statuses = []RevealStatus{failedRevealStatus(
				entry.Metadata.SettingID,
				newSettingError(ErrorCodeMutationFailed, "Requested frontend affinity token became unavailable before reveal dispatch: %s", targetFrontendID),
			)}
			return result, nil
		}
		result.Statuses = []RevealStatus{failedRevealStatus(
			entry.Metadata.SettingID,
			newSettingError(ErrorCodeMutationFailed, "Selected frontend websocket became unavailable before reveal dispatch: %s", targetFrontendID),
		)}
		return result, nil
	}

	waitCtx, cancel := context.WithTimeout(ctx, revealWaitTimeout(result.DurationMS))
	defer cancel()

	revealResult, err := c.results.Wait(waitCtx, requestID)
	if err != nil {
		if errors.Is(err, context.Canceled) && ctx.Err() != nil {
			return RevealResult{}, ctx.Err()
		}
		result.Statuses = []RevealStatus{failedRevealStatus(entry.Metadata.SettingID, mapRevealWaitError(entry.Metadata.SettingID, err))}
		return result, nil
	}

	frontendStatus, ok := revealStatusForSetting(revealResult.Statuses, entry.Metadata.SettingID)
	if !ok {
		result.Statuses = []RevealStatus{failedRevealStatus(
			entry.Metadata.SettingID,
			newSettingError(ErrorCodeMutationFailed, "Frontend reveal response did not include status for %s.", entry.Metadata.SettingID),
		)}
		return result, nil
	}

	if frontendStatus.Status == "revealed" {
		result.EmittedRevealCount = 1
		result.Statuses = []RevealStatus{{
			SettingID: entry.Metadata.SettingID,
			Status:    "revealed",
			Target:    &target,
		}}
		return result, nil
	}

	result.Statuses = []RevealStatus{failedRevealStatus(
		entry.Metadata.SettingID,
		settingErrorFromFrontendStatus(frontendStatus),
	)}
	return result, nil
}

func (c *RevealCoordinator) resolveTargetFrontendID(frontendAffinityToken string) (string, bool, error) {
	registry := c.transport.Registry()
	if registry == nil {
		return "", false, fmt.Errorf("uisettings: frontend reveal transport registry is required")
	}

	trimmedAffinityToken := strings.TrimSpace(frontendAffinityToken)
	if trimmedAffinityToken != "" {
		connectionID, ok := registry.ResolveFrontendConnectionID(trimmedAffinityToken, "")
		if !ok {
			return "", false, newSettingError(
				ErrorCodeMutationFailed,
				"Frontend affinity token is invalid or no longer available for reveal routing: %s",
				trimmedAffinityToken,
			)
		}
		return connectionID, true, nil
	}

	frontends := registry.Connections(realtime.Selection{Type: realtime.ConnectionTypeFrontend})
	if len(frontends) == 0 {
		return "", false, newSettingError(ErrorCodeMutationFailed, "No connected frontend is available for UI setting reveal.")
	}
	if len(frontends) > 1 {
		return "", false, newSettingError(
			ErrorCodeMutationFailed,
			"Reveal routing is ambiguous because multiple frontends are connected and no frontendAffinityToken was provided.",
		)
	}
	return frontends[0].ID, false, nil
}

func resolveRevealActiveSection(entry Entry, view projectview.SingleConfig, explicitSectionID string, contextSectionID string) (string, string, error) {
	location := entry.Location
	if location.Side != SideRight || !location.RequiresSectionSelection {
		return "", "", nil
	}

	if trimmed := strings.TrimSpace(explicitSectionID); trimmed != "" {
		return trimmed, trimmed, nil
	}
	if trimmed := strings.TrimSpace(contextSectionID); trimmed != "" {
		return trimmed, trimmed, nil
	}
	for _, activeSectionID := range view.ProjectConfig.ActiveIDs {
		if trimmed := strings.TrimSpace(activeSectionID); trimmed != "" {
			return "", trimmed, nil
		}
	}
	return "", "", newSettingError(
		ErrorCodeMutationFailed,
		"Right-pane reveal requires an active section. Pick a section and pass sectionIdToActivate.",
	)
}

func validateRightPaneRevealTarget(view projectview.SingleConfig, sectionID string, uiEditorTabName string) error {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return newSettingError(ErrorCodeMutationFailed, "Unknown section id: %s", sectionID)
	}
	if _, ok := view.Sections[trimmedSectionID]; !ok {
		return newSettingError(ErrorCodeMutationFailed, "Unknown section id: %s", trimmedSectionID)
	}

	tabName := strings.TrimSpace(uiEditorTabName)
	if tabName == "" {
		return newSettingError(ErrorCodeMutationFailed, "Right-pane reveal is missing uiEditorTabName metadata.")
	}

	sectionType, err := resolveEffectiveSectionType(view, trimmedSectionID)
	if err != nil {
		return newSettingError(ErrorCodeMutationFailed, "%s", err.Error())
	}
	requiredTabs, ok := requiredUIEditorTabsBySectionType[sectionType]
	if !ok {
		return newSettingError(ErrorCodeMutationFailed, "Section type %s does not support tab %s.", sectionType, tabName)
	}
	if _, ok := requiredTabs[tabName]; !ok {
		return newSettingError(ErrorCodeMutationFailed, "Section type %s does not support tab %s.", sectionType, tabName)
	}
	return nil
}

func resolveEffectiveSectionType(view projectview.SingleConfig, sectionID string) (string, error) {
	section, ok := view.Sections[sectionID]
	if !ok {
		return "", fmt.Errorf("unknown section id: %s", sectionID)
	}

	variantID := strings.TrimSpace(view.ProjectConfig.SectionVariantMap[sectionID])
	if variantID == "" && section.DefaultVariant != nil {
		variantID = strings.TrimSpace(*section.DefaultVariant)
	}
	if variantID == "" {
		return "", fmt.Errorf("section %s is missing an active variant", sectionID)
	}

	variant, ok := view.SectionVariants[variantID]
	if !ok {
		return "", fmt.Errorf("section %s references unknown variant %s", sectionID, variantID)
	}
	implID := strings.TrimSpace(variant.Impl)
	if implID == "" {
		return "", fmt.Errorf("section %s variant %s is missing an impl id", sectionID, variantID)
	}
	rawPayload, ok := view.SectionImpls[implID]
	if !ok {
		return "", fmt.Errorf("section %s variant %s references unknown impl %s", sectionID, variantID, implID)
	}

	var payload map[string]any
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return "", fmt.Errorf("section %s impl %s payload is invalid: %w", sectionID, implID, err)
	}
	sectionType, _ := payload["type"].(string)
	sectionType = strings.TrimSpace(sectionType)
	if sectionType == "" {
		return "", fmt.Errorf("section %s impl %s payload is missing type", sectionID, implID)
	}
	return sectionType, nil
}

func buildRevealTarget(entry Entry) realtime.UISettingRevealTarget {
	steps := make([]realtime.UISettingRevealActivationStep, 0, len(entry.RevealActivationSteps))
	for _, step := range entry.RevealActivationSteps {
		steps = append(steps, realtime.UISettingRevealActivationStep{
			Type:      string(step.Type),
			ItemValue: step.ItemValue,
		})
	}
	return realtime.UISettingRevealTarget{
		SettingID:             entry.SettingID,
		Side:                  string(entry.Location.Side),
		OverviewTabKey:        stringPointerIfNotBlank(entry.Location.OverviewTabKey),
		UIEditorTabName:       stringPointerIfNotBlank(entry.Location.UIEditorTabName),
		PluginID:              stringPointerIfNotBlank(entry.Location.PluginID),
		PaneID:                stringPointerIfNotBlank(entry.Location.PaneID),
		Strategy:              string(entry.Highlight.Strategy),
		AnchorID:              stringPointerIfNotBlank(entry.Highlight.AnchorID),
		PluginRevealKey:       stringPointerIfNotBlank(entry.Highlight.PluginRevealKey),
		RevealActivationSteps: steps,
	}
}

func failedRevealStatus(settingID string, err error) RevealStatus {
	return RevealStatus{
		SettingID: strings.TrimSpace(settingID),
		Status:    "failed",
		Error:     settingErrorValue(err),
	}
}

func settingErrorValue(err error) *SettingError {
	if err == nil {
		return nil
	}
	var settingErr *SettingError
	if errors.As(err, &settingErr) {
		return settingErr
	}
	return &SettingError{
		Code:    ErrorCodeMutationFailed,
		Message: err.Error(),
	}
}

func settingErrorFromFrontendStatus(status realtime.UISettingRevealResultStatus) *SettingError {
	code := ErrorCodeMutationFailed
	switch strings.TrimSpace(stringValue(status.ErrorCode)) {
	case string(ErrorCodeSettingNotFound):
		code = ErrorCodeSettingNotFound
	case string(ErrorCodeSettingReadOnly):
		code = ErrorCodeSettingReadOnly
	case string(ErrorCodeInvalidValueType):
		code = ErrorCodeInvalidValueType
	case string(ErrorCodeInvalidValueRangeOrEnum):
		code = ErrorCodeInvalidValueRangeOrEnum
	case string(ErrorCodePluginUnavailable):
		code = ErrorCodePluginUnavailable
	case string(ErrorCodeMutationFailed):
		code = ErrorCodeMutationFailed
	}

	message := strings.TrimSpace(stringValue(status.ErrorMessage))
	if message == "" {
		message = fmt.Sprintf("Frontend reveal failed for %s.", status.SettingID)
	}
	return &SettingError{Code: code, Message: message}
}

func mapRevealWaitError(settingID string, err error) error {
	var mismatch *realtime.RevealResultContractMismatchError
	if errors.As(err, &mismatch) {
		return newSettingError(ErrorCodeMutationFailed, "%s", mismatch.Error())
	}
	var disconnected *realtime.RevealResultTransportDisconnectedError
	if errors.As(err, &disconnected) {
		return newSettingError(
			ErrorCodeMutationFailed,
			"Selected frontend websocket disconnected before reveal confirmation: %s",
			disconnected.WebsocketID,
		)
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return newSettingError(
			ErrorCodeMutationFailed,
			"Timed out waiting for frontend reveal confirmation for %s.",
			strings.TrimSpace(settingID),
		)
	}
	return newSettingError(ErrorCodeMutationFailed, "%s", err.Error())
}

func revealStatusForSetting(statuses []realtime.UISettingRevealResultStatus, settingID string) (realtime.UISettingRevealResultStatus, bool) {
	trimmedSettingID := strings.TrimSpace(settingID)
	for _, status := range statuses {
		if strings.TrimSpace(status.SettingID) == trimmedSettingID {
			return status, true
		}
	}
	return realtime.UISettingRevealResultStatus{}, false
}

func boundRevealDuration(durationMS int) int {
	if durationMS <= 0 {
		return 2500
	}
	if durationMS > 10000 {
		return 10000
	}
	return durationMS
}

func revealWaitTimeout(durationMS int) time.Duration {
	timeout := time.Duration(durationMS)*time.Millisecond + 1500*time.Millisecond
	if timeout < 3*time.Second {
		return 3 * time.Second
	}
	if timeout > 12*time.Second {
		return 12 * time.Second
	}
	return timeout
}

func randomRevealRequestID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}

func stringPointerIfNotBlank(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
