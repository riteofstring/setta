package director

import "reflect"

// Contract registration for the generated TypeScript surface. Go owns every
// Director value and shape; the renderer receives them through generation, not
// through a hand-maintained mirror.

type ContractValueSet struct {
	Name   string
	Values []string
}

type ContractTaggedUnionBranch struct {
	Field     string
	KindValue string
}

type ContractTaggedUnion struct {
	Discriminator string
	Type          reflect.Type
	Branches      []ContractTaggedUnionBranch
}

type ContractDiscriminatedStructField struct {
	Name    string
	NonNull bool
}

type ContractDiscriminatedStructVariant struct {
	DiscriminatorValue string
	Fields             []ContractDiscriminatedStructField
}

type ContractDiscriminatedStruct struct {
	Type          reflect.Type
	Discriminator string
	Variants      []ContractDiscriminatedStructVariant
}

// ContractValueSets exposes every Director enumeration the renderer must handle
// exhaustively. The visual catalog maps over these, so adding a value here
// makes an unhandled case a compile error rather than a generic fallback.
func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "WorkstreamStatus", Values: stringValues(workstreamStatuses)},
		{Name: "WorkstreamResourceScopeKind", Values: stringValues(workstreamResourceScopeKinds)},
		{Name: "WorkstreamResourceKind", Values: stringValues(workstreamResourceKinds)},
		{Name: "WorkstreamDetailLevel", Values: stringValues(workstreamDetailLevels)},
		{Name: "SemanticNodeKind", Values: stringValues(semanticNodeKinds)},
		{Name: "SemanticNodeStatus", Values: stringValues(semanticNodeStatuses)},
		{Name: "SemanticEdgeKind", Values: stringValues(semanticEdgeKinds)},
		{Name: "SemanticActor", Values: stringValues(semanticActors)},
		{Name: "EvidenceClass", Values: stringValues(evidenceClasses)},
		{Name: "QueueItemStatus", Values: stringValues(queueItemStatuses)},
		{Name: "ApprovalStatus", Values: stringValues(approvalStatuses)},
		{Name: "ResourceRequestStatus", Values: stringValues(resourceRequestStatuses)},
		{Name: "ArtifactStatus", Values: stringValues(artifactStatuses)},
		{Name: "RecoveryStatus", Values: stringValues(recoveryStatuses)},
		{Name: "DirectorIntentKind", Values: stringValues(directorIntentKinds)},
		{Name: "DirectorSelectionDirection", Values: stringValues(directorSelectionDirections)},
		{Name: "DecisionIntentModality", Values: stringValues(decisionIntentModalities)},
		{Name: "DirectorDecisionKind", Values: stringValues(directorDecisionKinds)},
		{Name: "DecisionResolution", Values: stringValues(decisionResolutions)},
		{Name: "DirectorEventKind", Values: stringValues(directorEventKinds)},
		{Name: "DirectorResyncReason", Values: stringValues(directorResyncReasons)},
		{Name: "DirectorConnectionStatus", Values: stringValues(directorConnectionStatuses)},
		{Name: "DirectorTextSurface", Values: stringValues(directorTextSurfaces)},
	}
}

// ContractTaggedUnions registers the app-scoped event envelope so the generated
// decoder proves exactly one payload branch is populated and matches the kind.
func ContractTaggedUnions() []ContractTaggedUnion {
	return []ContractTaggedUnion{{
		Discriminator: "kind",
		Type:          reflect.TypeFor[DirectorEvent](),
		Branches: []ContractTaggedUnionBranch{
			{Field: "workstreamUpdated", KindValue: string(DirectorEventWorkstreamUpdated)},
			{Field: "workstreamRemoved", KindValue: string(DirectorEventWorkstreamRemoved)},
			{Field: "selectionChanged", KindValue: string(DirectorEventSelectionChanged)},
			{Field: "graphUpdated", KindValue: string(DirectorEventGraphUpdated)},
			{Field: "approvalUpdated", KindValue: string(DirectorEventApprovalUpdated)},
			{Field: "resourceRequestUpdated", KindValue: string(DirectorEventResourceRequestUpdated)},
			{Field: "artifactUpdated", KindValue: string(DirectorEventArtifactUpdated)},
			{Field: "aggregatesUpdated", KindValue: string(DirectorEventAggregatesUpdated)},
			{Field: "textDelta", KindValue: string(DirectorEventTextDelta)},
			{Field: "resyncRequired", KindValue: string(DirectorEventResyncRequired)},
		},
	}}
}

// directorIntentPayloadFields pairs each intent kind with the payload field it
// populates. The generated variants are derived from this one table, so adding
// an intent cannot leave a payload the renderer may set beside another kind.
var directorIntentPayloadFields = map[DirectorIntentKind]string{
	DirectorIntentSubmit:                 "submit",
	DirectorIntentSelectWorkstream:       "selectWorkstream",
	DirectorIntentMoveSelection:          "moveSelection",
	DirectorIntentCancelRun:              "cancelRun",
	DirectorIntentResolveApproval:        "resolveApproval",
	DirectorIntentResolveResourceRequest: "resolveResourceRequest",
}

func directorIntentContractVariants() []ContractDiscriminatedStructVariant {
	variants := make([]ContractDiscriminatedStructVariant, 0, len(directorIntentKinds))
	for _, kind := range directorIntentKinds {
		fields := make([]ContractDiscriminatedStructField, 0, len(directorIntentKinds))
		for _, other := range directorIntentKinds {
			fields = append(fields, ContractDiscriminatedStructField{
				Name:    directorIntentPayloadFields[other],
				NonNull: other == kind,
			})
		}
		variants = append(variants, ContractDiscriminatedStructVariant{
			DiscriminatorValue: string(kind),
			Fields:             fields,
		})
	}
	return variants
}

// ContractDiscriminatedStructs registers the shapes whose kind decides which
// payload is present, including the folderless scope that has none and the
// dispatched intent, which the shell constructs rather than decodes.
func ContractDiscriminatedStructs() []ContractDiscriminatedStruct {
	return []ContractDiscriminatedStruct{
		{
			Type:          reflect.TypeFor[DirectorIntent](),
			Discriminator: "kind",
			Variants:      directorIntentContractVariants(),
		},
		{
			Type:          reflect.TypeFor[WorkstreamResourceBinding](),
			Discriminator: "kind",
			Variants: []ContractDiscriminatedStructVariant{{
				DiscriminatorValue: string(WorkstreamResourceKindFolder),
				Fields:             []ContractDiscriminatedStructField{{Name: "folder", NonNull: true}},
			}},
		},
		{
			Type:          reflect.TypeFor[WorkstreamResourceScope](),
			Discriminator: "kind",
			Variants: []ContractDiscriminatedStructVariant{
				{
					DiscriminatorValue: string(WorkstreamResourceScopeFolderless),
					Fields:             []ContractDiscriminatedStructField{{Name: "folder"}},
				},
				{
					DiscriminatorValue: string(WorkstreamResourceScopeFolder),
					Fields:             []ContractDiscriminatedStructField{{Name: "folder", NonNull: true}},
				},
			},
		},
	}
}
