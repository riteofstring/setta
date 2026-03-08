#!/bin/bash
cd .. && \
find backend/setta/types/generated/ -name "*.py" -not -name "__init__.py" -delete && \
cd frontend && \
python -m generation.generate_unions dependency_keys && \
python -m generation.generate_unions dependency_values && \
python -m generation.generate_unions chart_settings && \
python -m generation.generate_unions chat_messages && \
python -m generation.generate_shared_modifier && \
python -m generation.generate_impl_field_literals && \
python -m generation.generate_args_as_typed_dicts && \
python -m generation.generate_user_default_impls && \
python -m generation.generate_impl_creation_fns && \
python -m generation.generate_settings_state && \
python -m generation.generate_unions unions && \
python -m generation.generate_effective_impls && \
python -m generation.generate_unions websocket_unions && \
python -m generation.generate_unions clipboard_data && \
python -m generation.generate_listener_endpoints && \
python -m generation.convert_pydantic_to_js && \
python -m generation.convert_constants_to_js && \
python -m generation.convert_endpoints && \
cd .. && \
./format_code.sh
echo "Done!"
