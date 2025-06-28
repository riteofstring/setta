#!/bin/bash
python -m generation.generate_impl_modifiers
python -m generation.generate_backend_union_types
python -m generation.generate_impl_to_modifier_fns
python -m generation.generate_user_default_impls
python -m generation.generate_impl_creation_fns
python -m generation.generate_settings_state
python -m generation.convert_pydantic_to_js
python -m generation.convert_constants_to_js
python -m generation.convert_endpoints
cd ..
./format_code.sh