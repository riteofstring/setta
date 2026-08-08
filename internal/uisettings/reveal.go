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
	ShareSessionID        string
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
	result, err := c.initializeRevealResult(input)
	if err != nil {
		return result, err
	}

	entry, err := resolveRevealEntry(input.Registry, input.SettingID)
	if err != nil {
		return failedRevealResult(result, input.SettingID, err), nil
	}

	requestedActiveSectionID, target, err := prepareRevealTarget(entry.Metadata, *input.ProjectView, input.SectionIDToActivate, input.ContextSectionID)
	if err != nil {
		return failedRevealResult(result, entry.Metadata.SettingID, err), nil
	}

	frontendStatus, err := c.dispatchReveal(ctx, input, result, entry.Metadata.SettingID, requestedActiveSectionID, target)
	if err != nil {
		if errors.Is(err, context.Canceled) && ctx.Err() != nil {
			return RevealResult{}, ctx.Err()
		}
		return failedRevealResult(result, entry.Metadata.SettingID, err), nil
	}

	if frontendStatus.Status == "revealed" {
		return successfulRevealResult(result, entry.Metadata.SettingID, target), nil
	}

	return failedRevealResult(result, entry.Metadata.SettingID, settingErrorFromFrontendStatus(frontendStatus)), nil
}

func (c *RevealCoordinator) initializeRevealResult(input RevealInput) (RevealResult, error) {
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
	return result, nil
}

func resolveRevealEntry(registry *Registry, settingID string) (RuntimeEntry, error) {
	entry, ok, err := registry.Get(settingID)
	if err != nil {
		return RuntimeEntry{}, newSettingError(ErrorCodeMutationFailed, "%s", err.Error())
	}
	if ok {
		return entry, nil
	}

	missingErr := registry.MissingSettingError(settingID)
	var settingErr *SettingError
	if errors.As(missingErr, &settingErr) {
		return RuntimeEntry{}, settingErr
	}
	return RuntimeEntry{}, newSettingError(ErrorCodeSettingNotFound, "Unknown setting id: %s", strings.TrimSpace(settingID))
}

func prepareRevealTarget(entry Entry, view projectview.SingleConfig, explicitSectionID string, contextSectionID string) (string, realtime.UISettingRevealTarget, error) {
	requestedActiveSectionID, resolvedActiveSectionID, err := resolveRevealActiveSection(entry, view, explicitSectionID, contextSectionID)
	if err != nil {
		return "", realtime.UISettingRevealTarget{}, err
	}
	if resolvedActiveSectionID != "" {
		if err := validateRightPaneRevealTarget(view, resolvedActiveSectionID, entry.Location.UIEditorTabName); err != nil {
			return "", realtime.UISettingRevealTarget{}, err
		}
	}
	return requestedActiveSectionID, buildRevealTarget(entry), nil
}

func (c *RevealCoordinator) dispatchReveal(
	ctx context.Context,
	input RevealInput,
	result RevealResult,
	settingID string,
	requestedActiveSectionID string,
	target realtime.UISettingRevealTarget,
) (realtime.UISettingRevealResultStatus, error) {
	targetFrontendID, affinitySelected, err := c.resolveTargetFrontendID(input.FrontendAffinityToken, input.ShareSessionID)
	if err != nil {
		return realtime.UISettingRevealResultStatus{}, err
	}
	if err := c.registerRevealRequest(result.RequestID, result.ProjectConfigID, settingID, targetFrontendID); err != nil {
		return realtime.UISettingRevealResultStatus{}, err
	}
	if err := c.sendRevealMessage(ctx, input, result, requestedActiveSectionID, target, targetFrontendID, affinitySelected); err != nil {
		return realtime.UISettingRevealResultStatus{}, err
	}
	return c.awaitRevealStatus(ctx, result.RequestID, result.DurationMS, settingID)
}

func (c *RevealCoordinator) registerRevealRequest(requestID string, projectConfigID string, settingID string, targetFrontendID string) error {
	return c.results.RegisterRequest(requestID, realtime.RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID:     targetFrontendID,
		ExpectedProjectConfigID: projectConfigID,
		ExpectedSettingIDs:      []string{settingID},
	})
}

func (c *RevealCoordinator) sendRevealMessage(
	ctx context.Context,
	input RevealInput,
	result RevealResult,
	requestedActiveSectionID string,
	target realtime.UISettingRevealTarget,
	targetFrontendID string,
	affinitySelected bool,
) error {
	delivered, sendErr := c.transport.SendJSON(ctx, realtime.NewUISettingRevealMessage(realtime.UISettingRevealContent{
		ProjectConfigID: result.ProjectConfigID,
		ChatID:          stringPointerIfNotBlank(input.ChatID),
		ActiveSectionID: stringPointerIfNotBlank(requestedActiveSectionID),
		Reveals:         []realtime.UISettingRevealTarget{target},
		DurationMS:      result.DurationMS,
		RequestID:       result.RequestID,
	}), targetFrontendID)
	if sendErr != nil {
		c.results.CancelRequest(result.RequestID)
		return sendErr
	}
	if delivered {
		return nil
	}

	c.results.CancelRequest(result.RequestID)
	if affinitySelected {
		return newSettingError(
			ErrorCodeMutationFailed,
			"Requested frontend affinity token became unavailable before reveal dispatch: %s",
			targetFrontendID,
		)
	}
	return newSettingError(
		ErrorCodeMutationFailed,
		"Selected frontend websocket became unavailable before reveal dispatch: %s",
		targetFrontendID,
	)
}

func (c *RevealCoordinator) awaitRevealStatus(
	ctx context.Context,
	requestID string,
	durationMS int,
	settingID string,
) (realtime.UISettingRevealResultStatus, error) {
	waitCtx, cancel := context.WithTimeout(ctx, revealWaitTimeout(durationMS))
	defer cancel()

	revealResult, err := c.results.Wait(waitCtx, requestID)
	if err != nil {
		if errors.Is(err, context.Canceled) && ctx.Err() != nil {
			return realtime.UISettingRevealResultStatus{}, ctx.Err()
		}
		return realtime.UISettingRevealResultStatus{}, mapRevealWaitError(settingID, err)
	}

	frontendStatus, ok := revealStatusForSetting(revealResult.Statuses, settingID)
	if !ok {
		return realtime.UISettingRevealResultStatus{}, newSettingError(
			ErrorCodeMutationFailed,
			"Frontend reveal response did not include status for %s.",
			settingID,
		)
	}
	return frontendStatus, nil
}

func failedRevealResult(result RevealResult, settingID string, err error) RevealResult {
	result.Statuses = []RevealStatus{failedRevealStatus(settingID, err)}
	return result
}

func successfulRevealResult(result RevealResult, settingID string, target realtime.UISettingRevealTarget) RevealResult {
	result.EmittedRevealCount = 1
	result.Statuses = []RevealStatus{{
		SettingID: settingID,
		Status:    "revealed",
		Target:    &target,
	}}
	return result
}

func (c *RevealCoordinator) resolveTargetFrontendID(frontendAffinityToken string, shareSessionID string) (string, bool, error) {
	registry := c.transport.Registry()
	if registry == nil {
		return "", false, fmt.Errorf("uisettings: frontend reveal transport registry is required")
	}

	trimmedAffinityToken := strings.TrimSpace(frontendAffinityToken)
	trimmedShareSessionID := strings.TrimSpace(shareSessionID)
	if trimmedAffinityToken != "" {
		connectionID, ok := registry.ResolveFrontendConnectionID(trimmedAffinityToken, trimmedShareSessionID)
		if !ok {
			return "", false, newSettingError(
				ErrorCodeMutationFailed,
				"Frontend affinity token is invalid or no longer available for reveal routing: %s",
				trimmedAffinityToken,
			)
		}
		return connectionID, true, nil
	}

	frontends := registry.Connections(realtime.Selection{
		Type:           realtime.ConnectionTypeFrontend,
		ShareSessionID: trimmedShareSessionID,
	})
	if len(frontends) == 0 {
		if trimmedShareSessionID != "" {
			return "", false, newSettingError(
				ErrorCodeMutationFailed,
				"No connected frontend is available for UI setting reveal in the requested share session.",
			)
		}
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
