package appspec

const (
	PatchCommentPrefix      = "//"
	PatchRootPath           = "/root"
	PatchElementsPathPrefix = "/elements/"
	PatchRootResetValue     = ""
)

type PatchPolicy struct {
	AllowedOps         []string `json:"allowedOps"`
	ValueOptionalOps   []string `json:"valueOptionalOps"`
	CommentPrefix      string   `json:"commentPrefix"`
	RootPath           string   `json:"rootPath"`
	ElementsPathPrefix string   `json:"elementsPathPrefix"`
	RootResetValue     string   `json:"rootResetValue"`
}

var supportedPatchOps = []string{
	"set",
	"add",
	"replace",
	"remove",
}

var patchValueOptionalOps = []string{
	"remove",
}

func DefaultPatchPolicy() PatchPolicy {
	return PatchPolicy{
		AllowedOps:         clonePatchPolicyStrings(supportedPatchOps),
		ValueOptionalOps:   clonePatchPolicyStrings(patchValueOptionalOps),
		CommentPrefix:      PatchCommentPrefix,
		RootPath:           PatchRootPath,
		ElementsPathPrefix: PatchElementsPathPrefix,
		RootResetValue:     PatchRootResetValue,
	}
}

func clonePatchPolicyStrings(values []string) []string {
	cloned := make([]string, len(values))
	copy(cloned, values)
	return cloned
}
