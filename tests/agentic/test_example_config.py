from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.example_config import seed_agentic_config_files
from setta.database.db_objs import DBE


class TestAgenticExampleConfigSeeding:
    def test_seed_agentic_config_files_writes_defaults_when_missing(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))

            seed_agentic_config_files(dbe)

            # First-run bootstrap should provide at least one engine/profile/agent config.
            engine_configs = dbe.read_engine_configs()
            transcription_profiles = dbe.read_transcription_profiles()
            external_agents = dbe.read_external_agents()
            agent_profiles = dbe.read_agent_profiles()

            assert len(engine_configs) > 0
            assert len(transcription_profiles) > 0
            assert len(external_agents) > 0
            assert len(agent_profiles) > 0
            assert any(
                item.get("id") == "engine-setta-claude-sonnet"
                for item in engine_configs
            )
            assert any(
                item.get("id") == "transcription-openai-whisper-1"
                for item in transcription_profiles
            )
            whisper_profile = next(
                (
                    item
                    for item in transcription_profiles
                    if item.get("id") == "transcription-openai-whisper-1"
                ),
                None,
            )
            assert whisper_profile is not None
            assert whisper_profile.get("transportMode") == "file"

    def test_seed_agentic_config_files_preserves_existing_files(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            existing_engine_payload = [{"id": "existing-engine"}]
            existing_transcription_payload = [{"id": "existing-transcription"}]
            existing_external_payload = [{"id": "existing-external"}]
            existing_profile_payload = [{"id": "existing-profile"}]
            dbe.write_engine_configs(existing_engine_payload)
            dbe.write_transcription_profiles(existing_transcription_payload)
            dbe.write_external_agents(existing_external_payload)
            dbe.write_agent_profiles(existing_profile_payload)

            seed_agentic_config_files(dbe)

            # Seeding must be non-destructive once files exist.
            assert dbe.read_engine_configs() == existing_engine_payload
            assert dbe.read_transcription_profiles() == existing_transcription_payload
            assert dbe.read_external_agents() == existing_external_payload
            assert dbe.read_agent_profiles() == existing_profile_payload
