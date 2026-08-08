package projectstate

// These frontend section variants intentionally reuse the canonical Dict/Code
// section shapes while preserving distinct generated frontend contract names.
type FrontendGlobalVariablesSectionImpl FrontendDictSectionImpl

type FrontendGenPythonCodeSectionImpl FrontendCodeSectionImpl

type FrontendGenPythonMetadataSectionImpl FrontendCodeSectionImpl
