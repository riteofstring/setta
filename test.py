from setta.utils.utils import QuoteInsensitiveDict

# Example usage
d = QuoteInsensitiveDict()
d["model['params']['weights']"] = "value1"
d['model["params"]["weights"]'] = "value2"
d["model[\"params\"][\"weights\"]"] = "value3"

print(d.keys())

print(d["model['params']['weights']"])  # Outputs: value2
print(d['model["params"]["weights"]'])  # Also outputs: value2