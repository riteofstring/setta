from dataclasses import dataclass

from setta.agentic.store import require_transcription_profile
from setta.database.db_objs import DBE
from setta.types.agentic import TranscriptionProfile
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig


@dataclass(frozen=True)
class ResolvedTranscriptionProfile:
    profile: TranscriptionProfile
    llm_config: LLMConfig | None


class TranscriptionProfileNotFoundError(KeyError):
    def __init__(self, transcription_profile_id: ID) -> None:
        self.transcription_profile_id = transcription_profile_id
        super().__init__(f"Transcription profile {transcription_profile_id} not found")


def resolve_transcription_profile(
    dbe: DBE,
    llm_configs: AllLLMConfigs,
    transcription_profile_id: ID,
) -> ResolvedTranscriptionProfile:
    try:
        profile = require_transcription_profile(dbe, transcription_profile_id)
    except KeyError as exc:
        raise TranscriptionProfileNotFoundError(transcription_profile_id) from exc
    llm_config: LLMConfig | None = None
    try:
        llm_config = llm_configs.resolve_config(profile.transcriptionLlmConfigId)
    except ValueError:
        llm_config = None
    return ResolvedTranscriptionProfile(profile=profile, llm_config=llm_config)
