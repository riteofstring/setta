import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE, LLM_CHAT_RUN_TYPE
from setta.agentic.store import (
    list_agent_run_ids_by_metadata,
    list_agent_runs_by_metadata,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.types.agentic import AgentRun, AgentRunStatus
from setta.types.id import ID
from setta.utils.timestamps import get_now_timestamp


class AgentRunIndexTests(unittest.TestCase):
    def test_index_filters_runs_by_metadata(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            now = get_now_timestamp()
            run_one = AgentRun(
                status=AgentRunStatus.completed,
                startedAt=now,
                finishedAt=now,
                inputs={
                    "runType": LLM_CHAT_RUN_TYPE,
                    "chatId": "chat-1",
                    "projectConfigId": "project-1",
                },
            )
            run_two = AgentRun(
                status=AgentRunStatus.completed,
                startedAt=now,
                finishedAt=now,
                inputs={
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                    "chatId": "chat-2",
                    "projectConfigId": "project-1",
                },
            )
            save_agent_run(dbe, run_one)
            save_agent_run(dbe, run_two)

            run_ids = list_agent_run_ids_by_metadata(
                dbe,
                run_type=LLM_CHAT_RUN_TYPE,
                chat_id=ID("chat-1"),
                project_config_id=ID("project-1"),
            )

            self.assertEqual([run_one.id], run_ids)

            runs = list_agent_runs_by_metadata(
                dbe,
                run_type=EXTERNAL_AGENT_RUN_TYPE,
                chat_id=ID("chat-2"),
                project_config_id=ID("project-1"),
            )

            self.assertEqual(1, len(runs))
            self.assertEqual(run_two.id, runs[0].id)


if __name__ == "__main__":
    unittest.main()
