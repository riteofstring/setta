from frontend.generation.convert_endpoints import (
    create_ts_fn_def,
    get_path_input_output_types,
)


def test_create_ts_fn_def_uses_form_wrapper_for_multipart_endpoints() -> None:
    # Multipart endpoints should always accept a FormData payload on the frontend.
    output = create_ts_fn_def(
        endpoint_path="/api/transcribeChatAudio",
        method="POST",
        fn_name="route_transcribe_chat_audio",
        args=["transcriptionProfileId", "file", "language"],
        args_with_annotations=[
            "transcriptionProfileId:gt.IDInput",
            "file:FormData",
            "language:string | null",
        ],
        output_annotation="gt.TranscribeChatAudioResponse",
        uses_form_data=True,
    )

    assert "route_transcribe_chat_audio(form: FormData)" in output
    assert 'post("/transcribeChatAudio", form)' in output


def test_create_ts_fn_def_generates_form_wrapper_when_contract_marks_multipart() -> (
    None
):
    # Multipart wrappers must come from route contract metadata.
    output = create_ts_fn_def(
        endpoint_path="/api/binary/upload",
        method="POST",
        fn_name="route_binary_upload",
        args=[],
        args_with_annotations=[],
        output_annotation="gt.BinaryContentRef",
        uses_form_data=True,
    )

    assert "route_binary_upload(form: FormData)" in output
    assert 'post("/binary/upload", form)' in output


def test_create_ts_fn_def_keeps_non_multipart_posts_as_json_posts() -> None:
    # Non-multipart POST endpoints should keep JSON/null body generation.
    output = create_ts_fn_def(
        endpoint_path="/api/share/deployments/current/session",
        method="POST",
        fn_name="route_create_share_session_current",
        args=[],
        args_with_annotations=[],
        output_annotation="gt.ShareSessionResponse",
        uses_form_data=False,
    )

    assert "route_create_share_session_current(form: FormData)" not in output
    assert 'post("/share/deployments/current/session", null)' in output


def test_get_path_input_output_types_marks_binary_upload_as_multipart() -> None:
    # Binary upload must be classified as multipart to preserve FormData clients.
    route_specs = get_path_input_output_types()

    assert route_specs["route_binary_upload"]["uses_form_data"] is True


def test_get_path_input_output_types_keeps_transcribe_chat_audio_multipart() -> None:
    # Transcribe stays FormData-based even though backend parsing is manual/auth-first.
    route_specs = get_path_input_output_types()

    assert route_specs["route_transcribe_chat_audio"]["uses_form_data"] is True
