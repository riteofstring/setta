package frontendbindings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
)

const semanticSidecarRelativePath = "frontend/generation/non_http_shared/sidecar.json"

type semanticSidecarManifest struct {
	DiscriminatedFamilies []semanticDiscriminatedFamily `json:"discriminatedFamilies"`
}

type semanticDiscriminatedFamily struct {
	BaseType                     string                           `json:"baseType"`
	EnumType                     string                           `json:"enumType"`
	Members                      []semanticDiscriminatedMember    `json:"members"`
	Traits                       []semanticDiscriminatedTraitSpec `json:"traits"`
	DefaultValuesByDiscriminator map[string]json.RawMessage       `json:"defaultValuesByDiscriminator"`
}

type semanticDiscriminatedMember struct {
	Name               string `json:"name"`
	DiscriminatorValue string `json:"discriminatorValue"`
}

type semanticDiscriminatedTraitSpec struct {
	UnionName   string   `json:"unionName"`
	LocalUnion  bool     `json:"localUnion"`
	IncludeBase bool     `json:"includeBase"`
	MemberTypes []string `json:"memberTypes"`
}

func semanticDiscriminatedFamilyDeclarations() ([]TypeDeclaration, error) {
	manifest, err := loadSemanticSidecarManifest()
	if err != nil {
		return nil, err
	}

	declarations := make([]TypeDeclaration, 0, len(manifest.DiscriminatedFamilies)*4)
	for _, family := range manifest.DiscriminatedFamilies {
		baseType := strings.TrimSpace(family.BaseType)
		enumType := strings.TrimSpace(family.EnumType)
		if baseType == "" {
			return nil, fmt.Errorf("frontend semantic sidecar family is missing baseType")
		}
		if enumType == "" {
			return nil, fmt.Errorf("frontend semantic sidecar family %s is missing enumType", baseType)
		}

		declarations = append(declarations, aliasDeclaration(baseType+"Union", "gt."+baseType+"Union"))

		memberValuesByName := make(map[string]string, len(family.Members))
		for _, member := range family.Members {
			name := strings.TrimSpace(member.Name)
			value := strings.TrimSpace(member.DiscriminatorValue)
			if name == "" {
				return nil, fmt.Errorf("frontend semantic sidecar family %s has a member with empty name", baseType)
			}
			if value == "" {
				return nil, fmt.Errorf("frontend semantic sidecar family %s member %s has empty discriminatorValue", baseType, name)
			}
			memberValuesByName[name] = value
		}

		for _, trait := range family.Traits {
			unionName := strings.TrimSpace(trait.UnionName)
			if unionName == "" {
				continue
			}
			memberTypeNames, memberValues, err := orderedTraitMembers(family.Members, trait.MemberTypes, memberValuesByName)
			if err != nil {
				return nil, fmt.Errorf("frontend semantic sidecar family %s trait %s: %w", baseType, unionName, err)
			}
			if len(memberTypeNames) == 0 {
				continue
			}

			returnTypeMembers := append([]string(nil), memberTypeNames...)
			if trait.IncludeBase {
				returnTypeMembers = append([]string{baseType}, returnTypeMembers...)
			}
			returnType := unionAliasExpr(returnTypeMembers...)
			if !trait.LocalUnion {
				declarations = append(declarations, aliasDeclaration(unionName, "gt."+unionName))
				returnType = unionName
			}

			traitTypeName := strings.TrimSuffix(unionName, "Union")
			traitSetName := traitTypeName + "TypeSet"
			declarations = append(declarations,
				setDeclaration(traitSetName, enumType, memberValues...),
				typeGuardDeclaration("is"+traitTypeName, baseType+"Union", returnType, traitSetName),
			)
		}

	}
	return declarations, nil
}

func applySemanticSidecarCreateBodies(
	converter *typeConverter,
	declarations []TypeDeclaration,
) ([]TypeDeclaration, error) {
	manifest, err := loadSemanticSidecarManifest()
	if err != nil {
		return nil, err
	}

	declarations = append([]TypeDeclaration(nil), declarations...)
	objectDeclarationIndex := make(map[string]int, len(declarations))
	for index, declaration := range declarations {
		if declaration.Kind != "object" {
			continue
		}
		objectDeclarationIndex[declaration.Name] = index
	}

	typesByName := frontendBindingTypesByName()
	for _, family := range manifest.DiscriminatedFamilies {
		baseType := strings.TrimSpace(family.BaseType)
		for discriminatorValue, rawDefault := range family.DefaultValuesByDiscriminator {
			memberTypeName, ok := memberTypeNameForDiscriminator(family.Members, discriminatorValue)
			if !ok {
				return nil, fmt.Errorf(
					"frontend semantic sidecar family %s discriminator %q has no matching member",
					baseType,
					discriminatorValue,
				)
			}
			index, ok := objectDeclarationIndex[memberTypeName]
			if !ok {
				return nil, fmt.Errorf(
					"frontend semantic sidecar family %s member %s has no object declaration",
					baseType,
					memberTypeName,
				)
			}
			if declarations[index].CreateBody != "" {
				continue
			}
			memberType, ok := typesByName[memberTypeName]
			if !ok {
				return nil, fmt.Errorf(
					"frontend semantic sidecar family %s member %s does not resolve to a Go type",
					baseType,
					memberTypeName,
				)
			}
			defaultValue, err := decodeSemanticDefaultValue(memberType, rawDefault)
			if err != nil {
				return nil, fmt.Errorf(
					"frontend semantic sidecar family %s member %s default: %w",
					baseType,
					memberTypeName,
					err,
				)
			}
			createDeclaration, err := converter.goBackedCreateFunctionDeclaration(memberType, defaultValue)
			if err != nil {
				return nil, fmt.Errorf(
					"frontend semantic sidecar family %s member %s create helper: %w",
					baseType,
					memberTypeName,
					err,
				)
			}
			declarations[index].CreateBody = createDeclaration.FunctionBody
		}
	}

	return declarations, nil
}

func frontendBindingTypesByName() map[string]reflect.Type {
	typesByName := make(map[string]reflect.Type, len(frontendBindingPublicTypeNames()))
	for t, name := range frontendBindingPublicTypeNames() {
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" {
			continue
		}
		typesByName[trimmedName] = t
	}
	return typesByName
}

func memberTypeNameForDiscriminator(members []semanticDiscriminatedMember, discriminatorValue string) (string, bool) {
	for _, member := range members {
		if member.DiscriminatorValue == discriminatorValue {
			return strings.TrimSpace(member.Name), true
		}
	}
	return "", false
}

func decodeSemanticDefaultValue(t reflect.Type, rawDefault json.RawMessage) (any, error) {
	valuePtr := reflect.New(t)
	if err := json.Unmarshal(rawDefault, valuePtr.Interface()); err != nil {
		return nil, err
	}
	return valuePtr.Elem().Interface(), nil
}

func orderedTraitMembers(
	members []semanticDiscriminatedMember,
	traitMemberTypes []string,
	memberValuesByName map[string]string,
) ([]string, []string, error) {
	if len(traitMemberTypes) == 0 {
		return nil, nil, nil
	}

	allowed := make(map[string]struct{}, len(traitMemberTypes))
	for _, memberType := range traitMemberTypes {
		name := strings.TrimSpace(memberType)
		if name == "" {
			continue
		}
		allowed[name] = struct{}{}
	}

	memberTypeNames := make([]string, 0, len(allowed))
	memberValues := make([]string, 0, len(allowed))
	for _, member := range members {
		name := strings.TrimSpace(member.Name)
		if _, ok := allowed[name]; !ok {
			continue
		}
		value, ok := memberValuesByName[name]
		if !ok {
			return nil, nil, fmt.Errorf("missing discriminator value for member %s", name)
		}
		memberTypeNames = append(memberTypeNames, name)
		memberValues = append(memberValues, fmt.Sprintf("%q", value))
		delete(allowed, name)
	}
	if len(allowed) > 0 {
		missing := make([]string, 0, len(allowed))
		for name := range allowed {
			missing = append(missing, name)
		}
		return nil, nil, fmt.Errorf("missing members in sidecar family: %s", strings.Join(missing, ", "))
	}
	return memberTypeNames, memberValues, nil
}

func loadSemanticSidecarManifest() (semanticSidecarManifest, error) {
	path, err := semanticSidecarManifestPath()
	if err != nil {
		return semanticSidecarManifest{}, err
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return semanticSidecarManifest{}, fmt.Errorf("read frontend semantic sidecar %s: %w", path, err)
	}
	var manifest semanticSidecarManifest
	if err := json.Unmarshal(payload, &manifest); err != nil {
		return semanticSidecarManifest{}, fmt.Errorf("decode frontend semantic sidecar %s: %w", path, err)
	}
	return manifest, nil
}

func semanticSidecarManifestPath() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("resolve frontend semantic sidecar path: runtime caller lookup failed")
	}
	repoRoot := filepath.Dir(filepath.Dir(filepath.Dir(currentFile)))
	return filepath.Join(repoRoot, semanticSidecarRelativePath), nil
}
