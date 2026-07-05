package chat

import "encoding/json"

func marshalRunItemOutputPage(page RunItemOutputPage) ([]byte, error) {
	type pageAlias RunItemOutputPage
	if page.Output == nil {
		page.Output = []RunItemOutput{}
	}
	return json.Marshal(pageAlias(page))
}
