-- TABLES --
CREATE TABLE IF NOT EXISTS Metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    defaultProject BLOB(16),
    FOREIGN KEY (defaultProject) REFERENCES ProjectConfig(id)
);
CREATE TABLE IF NOT EXISTS CodeInfo (
    id BLOB(16) PRIMARY KEY,
    name TEXT,
    data TEXT
);
CREATE TABLE IF NOT EXISTS CodeInfoColId (
    id BLOB(16),
    PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS CodeInfoCol (
    idid BLOB(16),
    parentId BLOB(16),
    childId BLOB(16),
    "order" INTEGER,
    PRIMARY KEY (idid, parentId, childId),
    FOREIGN KEY (idid) REFERENCES CodeInfoColId(id) ON DELETE CASCADE,
    FOREIGN KEY (parentId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
    FOREIGN KEY (childId) REFERENCES CodeInfo(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS Section (
    id BLOB(16) PRIMARY KEY,
    name TEXT,
    data TEXT,
    paramSweepSectionId BLOB(16),
    uiTypeId BLOB(16),
    uiTypeColId BLOB(16),
    FOREIGN KEY (paramSweepSectionId) REFERENCES Section(id) ON DELETE SET NULL,
    FOREIGN KEY (uiTypeId) REFERENCES UIType(id) ON DELETE CASCADE,
    FOREIGN KEY (uiTypeColId) REFERENCES UITypeColId(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS SectionConfig (
    projectConfigId BLOB(16),
    data TEXT,
    sectionId BLOB(16),
    variantId BLOB(16),
    PRIMARY KEY (projectConfigId, sectionId),
    FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
    FOREIGN KEY (sectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (variantId) REFERENCES SectionVariantId(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionConfigSelectedVariants (
    projectConfigId BLOB(16),
    sectionId BLOB(16),
    variantId BLOB(16),
    PRIMARY KEY (projectConfigId, sectionId, variantId),
    FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
    FOREIGN KEY (sectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (variantId) REFERENCES SectionVariantId(id) ON DELETE CASCADE
); 
CREATE TABLE IF NOT EXISTS SectionVariantId (
    id BLOB(16) PRIMARY KEY,
    name TEXT,
    data TEXT,
    selectedItem BLOB(16),
    codeInfoColId BLOB(16),
    originSectionId BLOB(16),
    FOREIGN KEY (selectedItem) REFERENCES CodeInfo(id) ON DELETE SET NULL,
    FOREIGN KEY (originSectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (codeInfoColId) REFERENCES CodeInfoColId(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS SectionVariantEV (
    idid BLOB(16),
    codeInfoId BLOB(16),
    data TEXT,
    PRIMARY KEY (idid, codeInfoId),
    FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
    FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantChildren (
    idid BLOB(16),
    childId BLOB(16),
    "order" INTEGER,
    PRIMARY KEY (idid, childId),
    FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
    FOREIGN KEY (childId) REFERENCES Section(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantParamSweep (
    idid BLOB(16),
    selectedItemGroupNum INTEGER,
    paramInfoGroupNum INTEGER,
    selectedItem BLOB(16),
    paramInfoId BLOB(16),
    "order" INTEGER,
    value TEXT,
    PRIMARY KEY (idid, "order"),
    FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
    FOREIGN KEY (selectedItem) REFERENCES CodeInfo(id) ON DELETE CASCADE,
    FOREIGN KEY (paramInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantRunGroup (
    idid BLOB(16),
    sectionId BLOB(16),
    parentVariantId BLOB(16),
    selected BOOLEAN,
    PRIMARY KEY (idid, sectionId, parentVariantId),
    FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
    FOREIGN KEY (sectionId) REFERENCES Section(id) ON DELETE CASCADE
    FOREIGN KEY (parentVariantId) REFERENCES SectionVariantId(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantRunGroupVersions (
    idid BLOB(16),
    sectionId BLOB(16),
    parentVariantId BLOB(16),
    versionId BLOB(16),
    selected BOOLEAN,
    PRIMARY KEY (idid, sectionId, parentVariantId, versionId),
    FOREIGN KEY (idid, sectionId, parentVariantId) 
        REFERENCES SectionVariantRunGroup(idid, sectionId, parentVariantId) 
        ON DELETE CASCADE,
    FOREIGN KEY (versionId) REFERENCES SectionVariantId(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantRunGroupParamSweeps (
    idid BLOB(16),
    sectionId BLOB(16),
    parentVariantId BLOB(16),
    sweepId BLOB(16),
    selected BOOLEAN,
    PRIMARY KEY (idid, sectionId, parentVariantId, sweepId),
    FOREIGN KEY (idid, sectionId, parentVariantId) 
        REFERENCES SectionVariantRunGroup(idid, sectionId, parentVariantId) 
        ON DELETE CASCADE,
    FOREIGN KEY (sweepId) REFERENCES SectionVariantId(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS UIType (
    id BLOB(16) PRIMARY KEY,
    type TEXT,
    data TEXT,
    asNonPresetForSectionId BLOB(16),
    asNonPresetForUITypeColId BLOB(16),
    asNonPresetForCodeInfoId BLOB(16),
    FOREIGN KEY (asNonPresetForSectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (asNonPresetForUITypeColId, asNonPresetForCodeInfoId) REFERENCES UITypeCol(idid, codeInfoId) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS UITypeColId (
    id BLOB(16) PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS UITypeCol (
    idid BLOB(16),
    codeInfoId BLOB(16),
    uiTypeId BLOB(16),
    PRIMARY KEY (idid, codeInfoId),
    FOREIGN KEY (idid) REFERENCES UITypeColId(id) ON DELETE CASCADE,
    FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
    FOREIGN KEY (uiTypeId) REFERENCES UIType(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ProjectConfig (
    id BLOB(16) PRIMARY KEY,
    name TEXT,
    data TEXT,
    UNIQUE (name)
);
CREATE TABLE IF NOT EXISTS ProjectConfigChildren (
    parentId BLOB(16),
    childId BLOB(16),
    data TEXT,
    PRIMARY KEY (parentId, childId),
    FOREIGN KEY (parentId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
    FOREIGN KEY (childId) REFERENCES Section(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionArtifacts (
    sectionId BLOB(16),
    artifactPath TEXT,
    data TEXT,
    PRIMARY KEY (sectionId, artifactPath),
    FOREIGN KEY (sectionId) REFERENCES Section(id)
);

-- INSERTS ---
INSERT OR IGNORE INTO Metadata (id, defaultProject) VALUES (1, NULL);



-- TRIGGERS --
CREATE TRIGGER IF NOT EXISTS set_new_default_project 
AFTER DELETE ON ProjectConfig
WHEN (SELECT defaultProject FROM Metadata WHERE id = 1) = OLD.id
BEGIN
    UPDATE Metadata 
    SET defaultProject = (
        SELECT id 
        FROM ProjectConfig 
        LIMIT 1
    )
    WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS set_default_project_if_null 
AFTER INSERT ON ProjectConfig
WHEN (SELECT defaultProject FROM Metadata WHERE id = 1) IS NULL
BEGIN
    UPDATE Metadata 
    SET defaultProject = NEW.id
    WHERE id = 1;
END;