# Direct `/settings` warm `load_project_config(...)` readout

Generated: 2026-04-13 01:25 UTC
Worktree: `pixijs-graph`
Lane: direct `/settings` warm-load backend readout

## Scope

Fresh warm-load capture after the `traverse_hierarchy(...)` cache reduction.
This keeps the lane honest about whether backend warm-load is still large
enough to justify more backend-only work before pivoting back to the live
renderer/product frontier.

Code paths touched for this readout:

- `scripts/capture_direct_settings_load_project_config_timing.py`
- `tests/project_state/load_project_config_timing_capture.py`
- `tests/project_state/test_load_project_config_timing.py`

## Command

```bash
source activate.sh && python scripts/capture_direct_settings_load_project_config_timing.py --sample-count 3
```

## Captured summaries

### Settings fixture warm loads

- sample count: `3`
- project_config_id: `f4ba1957-bd2a-4b35-9ea6-178a9e39bfcd`
- did_init values: `[False, False, False]`
- validation_cache_hit values: `[True, True, True]`

Average timings (ms):
- `convert_ms`: `231.226`
- `convert_project_state_shown_param_ids_ms`: `71.765`
- `convert_project_state_shown_param_ids_get_param_ids_to_show_ms`: `52.908`
- `convert_project_state_shown_param_ids_traverse_hierarchy_ms`: `44.287`
- `init_ms`: `0.047`
- `validation_ms`: `0.032`
- `total_ms`: `231.313`

Raw samples:
```text
sample 1: {'project_config_id': 'f4ba1957-bd2a-4b35-9ea6-178a9e39bfcd', 'did_init': False, 'section_count': 46, 'convert_ms': 224.16277599404566, 'convert_collect_ids_ms': 74.16762500361074, 'convert_slice_state_ms': 6.063947002985515, 'convert_project_state_ms': 142.44255200901534, 'convert_project_state_model_overhead_ms': 4.123512000660412, 'convert_project_state_content_validation_ms': 138.13586899777874, 'convert_project_state_singleton_sections_ms': 15.932255002553575, 'convert_project_state_active_ids_ms': 0.008351009455509484, 'convert_project_state_parent_section_map_ms': 16.35374799661804, 'convert_project_state_shown_param_ids_ms': 65.81597900367342, 'convert_project_state_shown_param_ids_effective_section_lookup_ms': 16.688457995769568, 'convert_project_state_shown_param_ids_get_param_ids_to_show_ms': 48.772977010230534, 'convert_project_state_shown_param_ids_traverse_hierarchy_ms': 41.05646205425728, 'convert_project_state_shown_param_ids_filter_for_ui_display_ms': 3.055935012525879, 'convert_project_state_required_decoded_images_ms': 16.810242988867685, 'convert_project_state_code_file_bindings_ms': 23.215292996610515, 'convert_project_state_layout_validation_ms': 0.18317101057618856, 'init_ms': 0.05645000783260912, 'init_update_ms': 0.0, 'validation_cache_hit': True, 'validation_resolve_ms': 0.0040199956856667995, 'validation_broadcast_ms': 0.027290996513329446, 'validation_ms': 0.031310992198996246, 'total_ms': 224.25908700097352}
sample 2: {'project_config_id': 'f4ba1957-bd2a-4b35-9ea6-178a9e39bfcd', 'did_init': False, 'section_count': 46, 'convert_ms': 226.98936800588854, 'convert_collect_ids_ms': 62.371100997552276, 'convert_slice_state_ms': 6.252050006878562, 'convert_project_state_ms': 157.1277980110608, 'convert_project_state_model_overhead_ms': 3.4955470327986404, 'convert_project_state_content_validation_ms': 153.44814998388756, 'convert_project_state_singleton_sections_ms': 16.953483995166607, 'convert_project_state_active_ids_ms': 0.00811999780125916, 'convert_project_state_parent_section_map_ms': 17.107584993937053, 'convert_project_state_shown_param_ids_ms': 75.36276399332564, 'convert_project_state_shown_param_ids_effective_section_lookup_ms': 19.182089978130534, 'convert_project_state_shown_param_ids_get_param_ids_to_show_ms': 55.816361083998345, 'convert_project_state_shown_param_ids_traverse_hierarchy_ms': 46.416089971899055, 'convert_project_state_shown_param_ids_filter_for_ui_display_ms': 4.378614001325332, 'convert_project_state_required_decoded_images_ms': 22.397266002371907, 'convert_project_state_code_file_bindings_ms': 21.61893100128509, 'convert_project_state_layout_validation_ms': 0.18410099437460303, 'init_ms': 0.043811000068672, 'init_update_ms': 0.0, 'validation_cache_hit': True, 'validation_resolve_ms': 0.003830005880445242, 'validation_broadcast_ms': 0.03003000165335834, 'validation_ms': 0.03386000753380358, 'total_ms': 227.0732990000397}
sample 3: {'project_config_id': 'f4ba1957-bd2a-4b35-9ea6-178a9e39bfcd', 'did_init': False, 'section_count': 46, 'convert_ms': 242.52702099329326, 'convert_collect_ids_ms': 77.89096399210393, 'convert_slice_state_ms': 7.220776999020018, 'convert_project_state_ms': 156.1594210070325, 'convert_project_state_model_overhead_ms': 4.29317400266882, 'convert_project_state_content_validation_ms': 151.64905499841552, 'convert_project_state_singleton_sections_ms': 20.193609001580626, 'convert_project_state_active_ids_ms': 0.008139992132782936, 'convert_project_state_parent_section_map_ms': 19.0299099922413, 'convert_project_state_shown_param_ids_ms': 74.11615400633309, 'convert_project_state_shown_param_ids_effective_section_lookup_ms': 19.55498001188971, 'convert_project_state_shown_param_ids_get_param_ids_to_show_ms': 54.13573910482228, 'convert_project_state_shown_param_ids_traverse_hierarchy_ms': 45.38792102539446, 'convert_project_state_shown_param_ids_filter_for_ui_display_ms': 3.702077956404537, 'convert_project_state_required_decoded_images_ms': 19.269081996753812, 'convert_project_state_code_file_bindings_ms': 19.03216000937391, 'convert_project_state_layout_validation_ms': 0.21719200594816357, 'init_ms': 0.040480008465237916, 'init_update_ms': 0.0, 'validation_cache_hit': True, 'validation_resolve_ms': 0.003930006641894579, 'validation_broadcast_ms': 0.027999994927085936, 'validation_ms': 0.031930001568980515, 'total_ms': 242.60641100408975}
```

### Project fixture warm loads

- sample count: `3`
- project_config_id: `sample-project-config`
- did_init values: `[False, False, False]`
- validation_cache_hit values: `[True, True, True]`

Average timings (ms):
- `convert_ms`: `0.371`
- `convert_project_state_shown_param_ids_ms`: `0.003`
- `convert_project_state_shown_param_ids_get_param_ids_to_show_ms`: `0.000`
- `convert_project_state_shown_param_ids_traverse_hierarchy_ms`: `0.000`
- `init_ms`: `0.024`
- `validation_ms`: `0.015`
- `total_ms`: `0.415`

Raw samples:
```text
sample 1: {'project_config_id': 'sample-project-config', 'did_init': False, 'section_count': 0, 'convert_ms': 0.3473230026429519, 'convert_collect_ids_ms': 0.0005600013537332416, 'convert_slice_state_ms': 0.01776100543793291, 'convert_project_state_ms': 0.27708199922926724, 'convert_project_state_model_overhead_ms': 0.05758000770583749, 'convert_project_state_content_validation_ms': 0.1912909938255325, 'convert_project_state_singleton_sections_ms': 0.0070699898060411215, 'convert_project_state_active_ids_ms': 0.0033099931897595525, 'convert_project_state_parent_section_map_ms': 0.0038600119296461344, 'convert_project_state_shown_param_ids_ms': 0.0039199949242174625, 'convert_project_state_shown_param_ids_effective_section_lookup_ms': 0.0, 'convert_project_state_shown_param_ids_get_param_ids_to_show_ms': 0.0, 'convert_project_state_shown_param_ids_traverse_hierarchy_ms': 0.0, 'convert_project_state_shown_param_ids_filter_for_ui_display_ms': 0.0, 'convert_project_state_required_decoded_images_ms': 0.0025400076992809772, 'convert_project_state_code_file_bindings_ms': 0.17059099627658725, 'convert_project_state_layout_validation_ms': 0.028210997697897255, 'init_ms': 0.023560001864098012, 'init_update_ms': 0.0, 'validation_cache_hit': True, 'validation_resolve_ms': 0.002019995008595288, 'validation_broadcast_ms': 0.013170007150620222, 'validation_ms': 0.01519000215921551, 'total_ms': 0.39052299689501524}
sample 2: {'project_config_id': 'sample-project-config', 'did_init': False, 'section_count': 0, 'convert_ms': 0.37779299600515515, 'convert_collect_ids_ms': 0.00039998849388211966, 'convert_slice_state_ms': 0.016050005797296762, 'convert_project_state_ms': 0.31263200799003243, 'convert_project_state_model_overhead_ms': 0.058420002460479736, 'convert_project_state_content_validation_ms': 0.2261220070067793, 'convert_project_state_singleton_sections_ms': 0.007080001523718238, 'convert_project_state_active_ids_ms': 0.003749999450519681, 'convert_project_state_parent_section_map_ms': 0.004360001184977591, 'convert_project_state_shown_param_ids_ms': 0.003100009053014219, 'convert_project_state_shown_param_ids_effective_section_lookup_ms': 0.0, 'convert_project_state_shown_param_ids_get_param_ids_to_show_ms': 0.0, 'convert_project_state_shown_param_ids_traverse_hierarchy_ms': 0.0, 'convert_project_state_shown_param_ids_filter_for_ui_display_ms': 0.0, 'convert_project_state_required_decoded_images_ms': 0.002629996743053198, 'convert_project_state_code_file_bindings_ms': 0.2052019990514964, 'convert_project_state_layout_validation_ms': 0.028089998522773385, 'init_ms': 0.02413098991382867, 'init_update_ms': 0.0, 'validation_cache_hit': True, 'validation_resolve_ms': 0.002129992935806513, 'validation_broadcast_ms': 0.013270007912069559, 'validation_ms': 0.015400000847876072, 'total_ms': 0.42223400669172406}
sample 3: {'project_config_id': 'sample-project-config', 'did_init': False, 'section_count': 0, 'convert_ms': 0.38718301220797, 'convert_collect_ids_ms': 0.0005100009730085731, 'convert_slice_state_ms': 0.016381003661081195, 'convert_project_state_ms': 0.316842008032836, 'convert_project_state_model_overhead_ms': 0.05627000064123422, 'convert_project_state_content_validation_ms': 0.23353200231213123, 'convert_project_state_singleton_sections_ms': 0.006319998647086322, 'convert_project_state_active_ids_ms': 0.003100009053014219, 'convert_project_state_parent_section_map_ms': 0.003859997377730906, 'convert_project_state_shown_param_ids_ms': 0.003110006218776107, 'convert_project_state_shown_param_ids_effective_section_lookup_ms': 0.0, 'convert_project_state_shown_param_ids_get_param_ids_to_show_ms': 0.0, 'convert_project_state_shown_param_ids_traverse_hierarchy_ms': 0.0, 'convert_project_state_shown_param_ids_filter_for_ui_display_ms': 0.0, 'convert_project_state_required_decoded_images_ms': 0.0024799956008791924, 'convert_project_state_code_file_bindings_ms': 0.21466199541464448, 'convert_project_state_layout_validation_ms': 0.027040005079470575, 'init_ms': 0.0235699990298599, 'init_update_ms': 0.0, 'validation_cache_hit': True, 'validation_resolve_ms': 0.0018999999156221747, 'validation_broadcast_ms': 0.01370999962091446, 'validation_ms': 0.015609999536536634, 'total_ms': 0.4312140081310645}
```

## Reading

- The current settings warm-load average is `~231.3ms` total, with `convert_ms` at `~231.2ms`.
- The shown-param path remains the largest measured sub-owner inside convert on the settings fixture: `shown_param_ids_ms ~71.8ms`, `get_param_ids_to_show_ms ~52.9ms`, `traverse_hierarchy_ms ~44.3ms`.
- Warm settings loads are now consistently true warm loads on this fixture (`did_init=False`, cached validation hits), so the old multi-second init/validation lane is not what this readout measures anymore.
- The generic project fixture remains near-zero (`total_ms ~0.4ms`), which keeps the comparison anchor intact.
- On this evidence alone, the backend warm-load path is no longer a multi-second blocker. If the live direct `/settings` experience still feels materially slow, the next default frontier should pivot back to the earliest product-facing gate and verify where the remaining user-facing delay sits.
