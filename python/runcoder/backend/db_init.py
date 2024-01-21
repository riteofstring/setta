import re

from .schema import dbq
from .seed import seed

CREATE_TABLES_COMMANDS = [
    # Settings model
    """
    CREATE TABLE IF NOT EXISTS Settings (
        profileName TEXT PRIMARY KEY,
        darkMode BOOLEAN DEFAULT 1
    );
    """,
    # CodeInfo model
    """
    CREATE TABLE IF NOT EXISTS CodeInfo (
        id TEXT PRIMARY KEY,
        name TEXT,
        editable BOOLEAN,
        rcType TEXT,
        defaultVal TEXT,
        description TEXT,
        isPinned BOOLEAN,
        isFrozen BOOLEAN,
        isSelected BOOLEAN
    );
    """,
    # CodeInfoCol model
    """
    CREATE TABLE IF NOT EXISTS CodeInfoCol (
        parentId TEXT,
        childId TEXT,
        "order" INTEGER,
        PRIMARY KEY (parentId, childId),
        FOREIGN KEY (parentId) REFERENCES CodeInfo(id),
        FOREIGN KEY (childId) REFERENCES CodeInfo(id)
    );
    """,
    # Section model
    """
    CREATE TABLE IF NOT EXISTS Section (
        id TEXT PRIMARY KEY,
        name TEXT,
        width INTEGER,
        height INTEGER,
        chainedFromId TEXT,
        evColId TEXT,
        paramSweepId TEXT,
        paramSweepFor TEXT,
        selectedItemId TEXT,
        uiTypeId TEXT,
        uiTypeColId TEXT,
        social TEXT,
        outputGroupId TEXT,
        description TEXT,
        descriptionHeight REAL,
        descriptionVisible BOOLEAN,
        script TEXT,
        code TEXT,
        varControl TEXT,
        isFrozen BOOLEAN,
        FOREIGN KEY (chainedFromId) REFERENCES Section(id),
        FOREIGN KEY (evColId) REFERENCES EVColId(id),
        FOREIGN KEY (paramSweepId) REFERENCES ParamSweep(id),
        FOREIGN KEY (paramSweepFor) REFERENCES Section(id),
        FOREIGN KEY (selectedItemId) REFERENCES CodeInfo(id),
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id),
        FOREIGN KEY (uiTypeColId) REFERENCES UITypeColId(id),
        FOREIGN KEY (outputGroupId) REFERENCES OutputGroup(id)
    );
    """,
    # SectionChildren model
    """
    CREATE TABLE IF NOT EXISTS SectionChildren (
        childId TEXT PRIMARY KEY,
        parentId TEXT,
        "order" INTEGER,
        FOREIGN KEY (childId) REFERENCES Section(id),
        FOREIGN KEY (parentId) REFERENCES Section(id)
    );
    """,
    # EVColId model
    """
    CREATE TABLE IF NOT EXISTS EVColId (
        id TEXT PRIMARY KEY,
        name TEXT,
        originSectionId TEXT,
        FOREIGN KEY (originSectionId) REFERENCES Section(id)
    );
    """,
    # EVCol model
    """
    CREATE TABLE IF NOT EXISTS EVCol (
        idid TEXT,
        codeInfoId TEXT,
        value TEXT,
        PRIMARY KEY (idid, codeInfoId),
        FOREIGN KEY (idid) REFERENCES EVColId(id),
        FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id)
    );
    """,
    # UIType model
    """
    CREATE TABLE IF NOT EXISTS UIType (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        presetType TEXT,
        sectionConfigCodeInfoId TEXT,
        sectionConfigChildUITypeId TEXT UNIQUE,
        sectionConfigSubType TEXT,
        sliderConfigMin REAL,
        sliderConfigMax REAL,
        sliderConfigStep REAL,
        asNonPresetForSectionId TEXT,
        asNonPresetForUITypeColId TEXT,
        asNonPresetForCodeInfoId TEXT,
        FOREIGN KEY (sectionConfigCodeInfoId) REFERENCES CodeInfo(id),
        FOREIGN KEY (sectionConfigChildUITypeId) REFERENCES UIType(id),
        FOREIGN KEY (asNonPresetForSectionId) REFERENCES Section(id),
        FOREIGN KEY (asNonPresetForUITypeColId, asNonPresetForCodeInfoId) REFERENCES UITypeCol(idid, codeInfoId)
    );
    """,
    # UITypeColId model
    """
    CREATE TABLE IF NOT EXISTS UITypeColId (
        id TEXT PRIMARY KEY
    );
    """,
    # UITypeCol model
    """
    CREATE TABLE IF NOT EXISTS UITypeCol (
        idid TEXT,
        codeInfoId TEXT,
        uiTypeId TEXT,
        PRIMARY KEY (idid, codeInfoId),
        FOREIGN KEY (idid) REFERENCES UITypeColId(id),
        FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id),
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id)
    );
    """,
    # Project model
    """
    CREATE TABLE IF NOT EXISTS Project (
        id TEXT PRIMARY KEY,
        name TEXT,
        defaultConfigId TEXT UNIQUE,
        UNIQUE (name),
        FOREIGN KEY (defaultConfigId) REFERENCES ProjectConfig(id)
    );
    """,
    # ProjectConfig model
    """
    CREATE TABLE IF NOT EXISTS ProjectConfig (
        id TEXT PRIMARY KEY,
        name TEXT,
        projectId TEXT,
        x REAL DEFAULT 0,
        y REAL DEFAULT 0,
        zoom REAL DEFAULT 1,
        UNIQUE (name, projectId),
        FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
    );
    """,
    # ProjectConfigChildren model
    """
    CREATE TABLE IF NOT EXISTS ProjectConfigChildren (
        parentId TEXT,
        childId TEXT,
        x REAL DEFAULT 0,
        y REAL DEFAULT 0,
        zIndex REAL DEFAULT 0,
        PRIMARY KEY (parentId, childId),
        FOREIGN KEY (parentId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
        FOREIGN KEY (childId) REFERENCES Section(id)
    );
    """,
    # UserCodeInfoTypeMap model
    """
    CREATE TABLE IF NOT EXISTS UserCodeInfoTypeMap (
        type TEXT,
        uiTypeId TEXT,
        PRIMARY KEY (type),
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id)
    );
    """,
    # ProjectConfigCodeInfoTypeMap model
    """
    CREATE TABLE IF NOT EXISTS ProjectConfigCodeInfoTypeMap (
        projectConfigId TEXT,
        type TEXT,
        uiTypeId TEXT,
        PRIMARY KEY (projectConfigId, type),
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id)
    );
    """,
    # Run model
    """
    CREATE TABLE IF NOT EXISTS Run (
        id TEXT PRIMARY KEY,
        name TEXT,
        projectConfigId TEXT,
        code TEXT,
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE
    );
    """,
    # OutputGroup model
    """
    CREATE TABLE IF NOT EXISTS OutputGroup (
        id TEXT PRIMARY KEY,
        name TEXT,
        runId TEXT,
        UNIQUE (name, runId),
        FOREIGN KEY (runId) REFERENCES Run(id)
    );
    """,
    # Output model
    """
    CREATE TABLE IF NOT EXISTS Output (
        id TEXT PRIMARY KEY,
        name TEXT,
        "values" REAL,
        outputGroupId TEXT,
        FOREIGN KEY (outputGroupId) REFERENCES OutputGroup(id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS ProjectConfigRunGroups (
        projectConfigId TEXT,
        runGroupId TEXT,
        "order" INTEGER,
        PRIMARY KEY (projectConfigId, runGroupId),
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id),
        FOREIGN KEY (runGroupId) REFERENCES RunGroup(id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS RunGroup (
        id TEXT PRIMARY KEY,
        name TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS RunGroupSections (
        runGroupId TEXT,
        sectionId TEXT,
        paramSweepId TEXT,
        PRIMARY KEY (runGroupId, sectionId, paramSweepId),
        FOREIGN KEY (runGroupId) REFERENCES RunGroup(id),
        FOREIGN KEY (sectionId) REFERENCES Section(id)
        FOREIGN KEY (paramSweepId) REFERENCES ParamSweep(id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS ParamSweep (
        id TEXT PRIMARY KEY,
        name TEXT,
        originSectionId TEXT,
        FOREIGN KEY (originSectionId) REFERENCES Section(id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS ParamSweepDetails (
        paramSweepId TEXT,
        paramInfoId TEXT,
        evColId TEXT,
        "order" INTEGER,
        value TEXT,
        PRIMARY KEY (paramSweepId, paramInfoId, evColId),
        FOREIGN KEY (paramSweepId) REFERENCES ParamSweep(id),
        FOREIGN KEY (paramInfoId) REFERENCES CodeInfo(id)
        FOREIGN KEY (evColId) REFERENCES EVColId(id)
        CHECK (paramInfoId IS NOT NULL OR evColId IS NOT NULL)
    );
    """,
]


def create_tables(db):
    for com in CREATE_TABLES_COMMANDS:
        db.execute(com)


TABLE_NAMES = set(
    [
        re.search(r"CREATE TABLE IF NOT EXISTS (\S+) \(", x).group(1)
        for x in CREATE_TABLES_COMMANDS
    ]
)


def tables_exist(db):
    db.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = db.fetchall()
    existing_tables = {table[0] for table in tables}
    return TABLE_NAMES.issubset(existing_tables)


def seed_data_exist(db, with_example_projects):
    to_check = ["Settings", "UIType"]
    if with_example_projects:
        to_check.append("Project")
    if not all(table in TABLE_NAMES for table in to_check):
        raise ValueError("Invalid table name")

    for table in to_check:
        db.execute(f"SELECT COUNT(*) FROM {table};")
        count = db.fetchone()[0]
        if count == 0:
            return False
    return True


def maybe_create_tables_and_seed(with_example_projects):
    dbq.connect()
    with dbq.get() as db:
        if not tables_exist(db):
            create_tables(db)
        if not seed_data_exist(db, with_example_projects):
            seed(db, with_example_projects)
    dbq.disconnect()
