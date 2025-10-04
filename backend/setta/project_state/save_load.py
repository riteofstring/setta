from setta.database.backup import maybe_create_backup
from setta.database.db_objs import DBE
from setta.types.generated.settings_state import SettingsState
from setta.types.project_state import ProjectStateBackend


def save(settings: SettingsState, dbe: DBE, project_state: ProjectStateBackend):
    maybe_create_backup(
        dbe.project,
        settings.backend.autobackup,
        settings.backend.autobackupFreq,
        settings.backend.autobackupKeepLastN,
    )
    dbe.write_project(project_state)
    # maybe_export_database(
    #     db,
    #     dbe.path,
    #     settings.backend.exportDbRawOnSave,
    #     settings.backend.exportDbReadableOnSave,
    #     settings.backend.exportDbReadableWithVariantsOnSave,
    # )
