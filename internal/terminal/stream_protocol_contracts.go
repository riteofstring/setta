package terminal

import "reflect"

type ContractUnion struct {
	Discriminator string
	Name          string
	Type          reflect.Type
	Variants      []ContractUnionVariant
}

type ContractUnionVariant struct {
	KindValue string
	Name      string
	Type      reflect.Type
}

func ContractUnions() []ContractUnion {
	return []ContractUnion{
		{
			Discriminator: "kind",
			Name:          "TerminalStreamClientMessage",
			Type:          reflect.TypeFor[TerminalStreamClientMessage](),
			Variants: []ContractUnionVariant{
				{KindValue: string(TerminalStreamClientStart), Name: "TerminalStreamStartMessage", Type: reflect.TypeFor[TerminalStreamStartMessage]()},
				{KindValue: string(TerminalStreamClientResume), Name: "TerminalStreamResumeMessage", Type: reflect.TypeFor[TerminalStreamResumeMessage]()},
				{KindValue: string(TerminalStreamClientInput), Name: "TerminalStreamInputMessage", Type: reflect.TypeFor[TerminalStreamInputMessage]()},
			},
		},
		{
			Discriminator: "kind",
			Name:          "TerminalStreamServerMessage",
			Type:          reflect.TypeFor[TerminalStreamServerMessage](),
			Variants: []ContractUnionVariant{
				{KindValue: string(TerminalStreamServerReady), Name: "TerminalStreamReadyMessage", Type: reflect.TypeFor[TerminalStreamReadyMessage]()},
				{KindValue: string(TerminalStreamServerInputAck), Name: "TerminalStreamInputAckMessage", Type: reflect.TypeFor[TerminalStreamInputAckMessage]()},
				{KindValue: string(TerminalStreamServerEvent), Name: "TerminalStreamEventMessage", Type: reflect.TypeFor[TerminalStreamEventMessage]()},
				{KindValue: string(TerminalStreamServerReplayTruncated), Name: "TerminalStreamReplayTruncatedMessage", Type: reflect.TypeFor[TerminalStreamReplayTruncatedMessage]()},
				{KindValue: string(TerminalStreamServerError), Name: "TerminalStreamErrorMessage", Type: reflect.TypeFor[TerminalStreamErrorMessage]()},
			},
		},
	}
}

func streamContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "TerminalStreamClientMessageKind", Values: []string{
			string(TerminalStreamClientStart),
			string(TerminalStreamClientResume),
			string(TerminalStreamClientInput),
		}},
		{Name: "TerminalStreamServerMessageKind", Values: []string{
			string(TerminalStreamServerReady),
			string(TerminalStreamServerInputAck),
			string(TerminalStreamServerEvent),
			string(TerminalStreamServerReplayTruncated),
			string(TerminalStreamServerError),
		}},
		{Name: "TerminalStreamErrorCode", Values: []string{
			string(TerminalStreamErrorMalformedFrame),
			string(TerminalStreamErrorUnsupportedMessage),
			string(TerminalStreamErrorNotReady),
			string(TerminalStreamErrorIdentityMismatch),
			string(TerminalStreamErrorSessionNotFound),
			string(TerminalStreamErrorInputSequenceGap),
			string(TerminalStreamErrorInputSequenceConflict),
			string(TerminalStreamErrorInputTooLarge),
			string(TerminalStreamErrorInputBackpressure),
			string(TerminalStreamErrorOutputBackpressure),
			string(TerminalStreamErrorEventCursorUnavailable),
			string(TerminalStreamErrorInternal),
		}},
	}
}
