package settajsonrenderappgenbackend

import "setta/plugins/setta-json-render-app-gen/backend/appspec"

func FrontendValueAppSpecPatchPolicyConfig() appspec.PatchPolicy {
	return appspec.DefaultPatchPolicy()
}
