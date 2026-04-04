package frontendbindings

import "setta/internal/plugins"

func pluginSourceSupportDeclarations() []TypeDeclaration {
	contract := plugins.FrontendSourceValidationContractData()
	return []TypeDeclaration{
		setDeclaration(
			"generatedPluginSourceAllowedPackageNameCharacters",
			"string",
			false,
			tsStringLiteralMembers(contract.AllowedPackageNameCharacters)...,
		),
		constDeclaration(
			"generatedPluginSourceGitHubScheme",
			false,
			tsStringLiteralExpr(contract.GitHubScheme),
		),
		constDeclaration(
			"generatedPluginSourcePyPIScheme",
			false,
			tsStringLiteralExpr(contract.PyPIScheme),
		),
		constDeclaration(
			"generatedPluginSourceGitHubUsageMessage",
			false,
			tsStringLiteralExpr(contract.GitHubUsageMessage),
		),
		constDeclaration(
			"generatedPluginSourcePyPIUsageMessage",
			false,
			tsStringLiteralExpr(contract.PyPIUsageMessage),
		),
		constDeclaration(
			"generatedPluginSourceUnsupportedSpecPrefix",
			false,
			tsStringLiteralExpr(contract.UnsupportedSpecPrefix),
		),
		constDeclaration(
			"generatedPluginSourceUnsupportedSchemePrefix",
			false,
			tsStringLiteralExpr(contract.UnsupportedSchemePrefix),
		),
		constDeclaration(
			"generatedPluginSourceInvalidPyPISpecPrefix",
			false,
			tsStringLiteralExpr(contract.InvalidPyPISpecPrefix),
		),
		constDeclaration(
			"generatedPluginSourceInvalidPackageNamePrefix",
			false,
			tsStringLiteralExpr(contract.InvalidPackageNamePrefix),
		),
		functionDeclaration(
			"validateGeneratedGitHubPluginSourceSpec",
			false,
			"string | null",
			buildValidateGeneratedGitHubPluginSourceSpecBody(),
			TypeProperty{Name: "rest", TypeExpr: "string"},
		),
		functionDeclaration(
			"validateGeneratedPyPIPluginSourceSpec",
			false,
			"string | null",
			buildValidateGeneratedPyPIPluginSourceSpecBody(),
			TypeProperty{Name: "rest", TypeExpr: "string"},
		),
		functionDeclaration(
			"validateGeneratedPluginPackageName",
			false,
			"string | null",
			buildValidateGeneratedPluginPackageNameBody(),
			TypeProperty{Name: "packageName", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"validateGeneratedPluginSourceSpec",
			"string | null",
			buildValidateGeneratedPluginSourceSpecBody(),
			TypeProperty{Name: "sourceSpec", TypeExpr: "string"},
		),
	}
}

func buildValidateGeneratedPluginSourceSpecBody() string {
	return `const raw = sourceSpec.trim();
if (!raw) {
  return "Source spec is required.";
}
if (!raw.includes(":")) {
  return generatedPluginSourceUnsupportedSpecPrefix + sourceSpec;
}
const colonIndex = raw.indexOf(":");
const scheme = raw.slice(0, colonIndex).trim().toLowerCase();
const rest = raw.slice(colonIndex + 1);
if (scheme === generatedPluginSourceGitHubScheme) {
  return validateGeneratedGitHubPluginSourceSpec(rest);
}
if (scheme === generatedPluginSourcePyPIScheme) {
  return validateGeneratedPyPIPluginSourceSpec(rest);
}
return generatedPluginSourceUnsupportedSchemePrefix + scheme;`
}

func buildValidateGeneratedGitHubPluginSourceSpecBody() string {
	return `if (!rest.trim()) {
  return generatedPluginSourceGitHubUsageMessage;
}
let repoSpec = rest;
const hashIndex = rest.indexOf("#");
const atIndex = rest.indexOf("@");
if (hashIndex !== -1 && (atIndex === -1 || hashIndex < atIndex)) {
  repoSpec = rest.slice(0, hashIndex);
} else if (atIndex !== -1) {
  repoSpec = rest.slice(0, atIndex);
}
const slashIndex = repoSpec.indexOf("/");
if (slashIndex === -1) {
  return generatedPluginSourceGitHubUsageMessage;
}
const owner = repoSpec.slice(0, slashIndex);
const repo = repoSpec.slice(slashIndex + 1);
if (!owner.trim() || !repo.trim()) {
  return generatedPluginSourceGitHubUsageMessage;
}
return null;`
}

func buildValidateGeneratedPyPIPluginSourceSpecBody() string {
	return `const packageSpec = rest.trim();
if (!packageSpec) {
  return generatedPluginSourcePyPIUsageMessage;
}
const versionSeparatorIndex = packageSpec.indexOf("==");
if (versionSeparatorIndex === -1) {
  return validateGeneratedPluginPackageName(packageSpec);
}
const packageName = packageSpec.slice(0, versionSeparatorIndex);
const version = packageSpec.slice(versionSeparatorIndex + 2);
const packageNameError = validateGeneratedPluginPackageName(packageName);
if (packageNameError) {
  return packageNameError;
}
if (!version.trim()) {
  return generatedPluginSourceInvalidPyPISpecPrefix + packageSpec;
}
return null;`
}

func buildValidateGeneratedPluginPackageNameBody() string {
	return `const trimmed = packageName.trim().toLowerCase();
if (!trimmed) {
  return generatedPluginSourceInvalidPackageNamePrefix + JSON.stringify(packageName);
}
for (const char of trimmed) {
  if (!generatedPluginSourceAllowedPackageNameCharacters.has(char)) {
    return generatedPluginSourceInvalidPackageNamePrefix + JSON.stringify(packageName);
  }
}
return null;`
}
