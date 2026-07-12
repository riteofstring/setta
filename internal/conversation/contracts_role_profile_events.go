package conversation

import "fmt"

type ConversationRoleProfileOverrideUpdatedEventPayload struct {
	Type     ConversationEventType `json:"type"`
	Override RoleProfileOverride   `json:"override"`
}

type ConversationRoleProfileOverrideRemovedEventPayload struct {
	Type ConversationEventType `json:"type"`
	Role Role                  `json:"role"`
}

func (payload ConversationRoleProfileOverrideUpdatedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeRoleProfileOverrideUpdated
}

func (payload ConversationRoleProfileOverrideUpdatedEventPayload) validateConversationEventPayload(
	_ string,
	conversationID string,
) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if err := payload.Override.Validate(); err != nil {
		return err
	}
	if payload.Override.ScopeKind != RoleProfileScopeConversation ||
		payload.Override.ScopeID != conversationID {
		return fmt.Errorf(
			"conversation.role_profile_override.updated payload ownership does not match event",
		)
	}
	return nil
}

func (payload ConversationRoleProfileOverrideRemovedEventPayload) conversationEventType() ConversationEventType {
	return ConversationEventTypeRoleProfileOverrideRemoved
}

func (payload ConversationRoleProfileOverrideRemovedEventPayload) validateConversationEventPayload(
	_ string,
	_ string,
) error {
	if err := validateEventPayloadType(payload.Type, payload.conversationEventType()); err != nil {
		return err
	}
	if !containsRole(configurableRoles(RoleProfileScopeConversation), payload.Role) {
		return fmt.Errorf(
			"conversation.role_profile_override.removed has unsupported role %s",
			payload.Role,
		)
	}
	return nil
}
