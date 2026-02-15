from frontend.generation.convert_endpoints import create_ts_fn_def


def test_create_ts_fn_def_uses_form_wrapper_for_multipart_endpoints() -> None:
    # Multipart endpoints should always accept a FormData payload on the frontend.
    output = create_ts_fn_def(
        endpoint_path="/api/transcribeChatAudio",
        method="POST",
        fn_name="route_transcribe_chat_audio",
        args=["engineConfigId", "file", "language"],
        args_with_annotations=[
            "engineConfigId:gt.IDInput",
            "file:FormData",
            "language:string | null",
        ],
        output_annotation="gt.TranscribeChatAudioResponse",
        uses_form_data=True,
        has_request_param=False,
    )

    assert "route_transcribe_chat_audio(form: FormData)" in output
    assert 'post("/transcribeChatAudio", form)' in output


def test_create_ts_fn_def_uses_form_wrapper_for_request_upload_endpoints() -> None:
    # Request-driven upload endpoints should still be generated as FormData wrappers.
    output = create_ts_fn_def(
        endpoint_path="/api/binary/upload",
        method="POST",
        fn_name="route_binary_upload",
        args=[],
        args_with_annotations=[],
        output_annotation="gt.BinaryContentRef",
        uses_form_data=False,
        has_request_param=True,
    )

    assert "route_binary_upload(form: FormData)" in output
    assert 'post("/binary/upload", form)' in output


def test_create_ts_fn_def_keeps_non_upload_request_endpoints_as_json_posts() -> None:
    # POST endpoints using Request for metadata should keep JSON/null body generation.
    output = create_ts_fn_def(
        endpoint_path="/api/share/deployments/current/session",
        method="POST",
        fn_name="route_create_share_session_current",
        args=[],
        args_with_annotations=[],
        output_annotation="gt.ShareSessionResponse",
        uses_form_data=False,
        has_request_param=True,
    )

    assert "route_create_share_session_current(form: FormData)" not in output
    assert 'post("/share/deployments/current/session", null)' in output
