from setta.database.backup import maybe_create_backup
from setta.database.db.projects.save import save_project_state
from setta.database.db_objs import DBE
from setta.database.export_db.export_db import maybe_export_database
from setta.types.generated.settings_state import SettingsState
from setta.types.project_state import ProjectStateBackend


def save(settings: SettingsState, dbe: DBE, project_state: ProjectStateBackend):
    maybe_create_backup(
        dbe.path,
        settings.backend.autobackup,
        settings.backend.autobackupFreq,
        settings.backend.autobackupKeepLastN,
    )
    with dbe.session as db:
        save_project_state(db, project_state)
        maybe_export_database(
            db,
            dbe.path,
            settings.backend.exportDbRawOnSave,
            settings.backend.exportDbReadableOnSave,
            settings.backend.exportDbReadableWithVariantsOnSave,
        )
