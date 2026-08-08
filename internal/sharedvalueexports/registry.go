package sharedvalueexports

import "reflect"

type ValueExport struct {
	Name  string
	Type  reflect.Type
	Value func() any
}
