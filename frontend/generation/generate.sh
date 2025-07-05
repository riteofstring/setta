#!/bin/bash
python -m generation.generate_all
python -m generation.convert_pydantic_to_js
python -m generation.convert_constants_to_js
python -m generation.convert_endpoints
cd ..
./format_code.sh