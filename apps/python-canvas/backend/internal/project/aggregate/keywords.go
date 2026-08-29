package aggregate

import "sort"

var pythonKeywords = map[string]struct{}{
	"False": {}, "None": {}, "True": {}, "and": {}, "as": {}, "assert": {},
	"async": {}, "await": {}, "break": {}, "class": {}, "continue": {}, "def": {},
	"del": {}, "elif": {}, "else": {}, "except": {}, "finally": {}, "for": {},
	"from": {}, "global": {}, "if": {}, "import": {}, "in": {}, "is": {},
	"lambda": {}, "nonlocal": {}, "not": {}, "or": {}, "pass": {}, "raise": {},
	"return": {}, "try": {}, "while": {}, "with": {}, "yield": {},
}

// PythonKeywords returns the aggregate's canonical keyword set in deterministic
// order. The generated transport declaration consumes this rather than keeping a
// frontend-only copy of a rule that the aggregate enforces.
func PythonKeywords() []string {
	keywords := make([]string, 0, len(pythonKeywords))
	for keyword := range pythonKeywords {
		keywords = append(keywords, keyword)
	}
	sort.Strings(keywords)
	return keywords
}
