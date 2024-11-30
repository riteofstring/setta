
CREATE TABLE IF NOT EXISTS CodeInfo (
    id TEXT PRIMARY KEY,
    data TEXT
);
CREATE TABLE IF NOT EXISTS CodeInfoColId (
    id TEXT,
    PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS CodeInfoCol (
    idid TEXT,
    parentId TEXT,
    childId TEXT,
    "order" INTEGER,
    PRIMARY KEY (idid, parentId, childId),
    FOREIGN KEY (idid) REFERENCES CodeInfoColId(id) ON DELETE CASCADE,
    FOREIGN KEY (parentId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
    FOREIGN KEY (childId) REFERENCES CodeInfo(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS Section (
    id TEXT PRIMARY KEY,
    data TEXT,
    paramSweepSectionId TEXT,
    uiTypeId TEXT,
    uiTypeColId TEXT,
    FOREIGN KEY (paramSweepSectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (uiTypeId) REFERENCES UIType(id) ON DELETE CASCADE,
    FOREIGN KEY (uiTypeColId) REFERENCES UITypeColId(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionConfig (
    projectConfigId TEXT,
    data TEXT,
    sectionId TEXT,
    variantId TEXT,
    PRIMARY KEY (projectConfigId, sectionId),
    FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
    FOREIGN KEY (sectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (variantId) REFERENCES SectionVariantId(id) ON DELETE CASCADE
);
   
CREATE TABLE IF NOT EXISTS SectionVariantId (
    id TEXT PRIMARY KEY,
    data TEXT,
    selectedItem TEXT,
    codeInfoColId TEXT,
    originSectionId TEXT,
    FOREIGN KEY (selectedItem) REFERENCES CodeInfo(id) ON DELETE CASCADE,
    FOREIGN KEY (originSectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (codeInfoColId) REFERENCES CodeInfoColId(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantEV (
    idid TEXT,
    codeInfoId TEXT,
    data TEXT,
    PRIMARY KEY (idid, codeInfoId),
    FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
    FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantChildren (
    idid TEXT,
    childId TEXT,
    "order" INTEGER,
    PRIMARY KEY (idid, childId),
    FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
    FOREIGN KEY (childId) REFERENCES Section(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionVariantParamSweep (
    idid TEXT,
    selectedItemGroupNum INTEGER,
    paramInfoGroupNum INTEGER,
    selectedItem TEXT,
    paramInfoId TEXT,
    "order" INTEGER,
    value TEXT,
    PRIMARY KEY (idid, "order"),
    FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
    FOREIGN KEY (selectedItem) REFERENCES CodeInfo(id) ON DELETE CASCADE,
    FOREIGN KEY (paramInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS UIType (
    id TEXT PRIMARY KEY,
    data TEXT,
    asNonPresetForSectionId TEXT,
    asNonPresetForUITypeColId TEXT,
    asNonPresetForCodeInfoId TEXT,
    FOREIGN KEY (asNonPresetForSectionId) REFERENCES Section(id) ON DELETE CASCADE,
    FOREIGN KEY (asNonPresetForUITypeColId, asNonPresetForCodeInfoId) REFERENCES UITypeCol(idid, codeInfoId) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS UITypeColId (
    id TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS UITypeCol (
    idid TEXT,
    codeInfoId TEXT,
    uiTypeId TEXT,
    PRIMARY KEY (idid, codeInfoId),
    FOREIGN KEY (idid) REFERENCES UITypeColId(id) ON DELETE CASCADE,
    FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
    FOREIGN KEY (uiTypeId) REFERENCES UIType(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ProjectConfig (
    id TEXT PRIMARY KEY,
    name TEXT,
    data TEXT,
    shownRunGroup TEXT,
    UNIQUE (name),
    FOREIGN KEY (shownRunGroup) REFERENCES RunGroup(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ProjectConfigChildren (
    parentId TEXT,
    childId TEXT,
    data TEXT,
    PRIMARY KEY (parentId, childId),
    FOREIGN KEY (parentId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
    FOREIGN KEY (childId) REFERENCES Section(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS SectionArtifacts (
    sectionId TEXT,
    artifactPath TEXT,
    data TEXT,
    PRIMARY KEY (sectionId, artifactPath),
    FOREIGN KEY (sectionId) REFERENCES Section(id)
);
CREATE TABLE IF NOT EXISTS RunGroup (
    id TEXT PRIMARY KEY,
    jsonRepr TEXT
);
CREATE TABLE IF NOT EXISTS ProjectConfigRunGroup (
    projectConfigId TEXT KEY,
    runGroupId TEXT KEY,
    selected BOOLEAN,
    "order" INTEGER,
    PRIMARY KEY (projectConfigId, runGroupId),
    FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id),
    FOREIGN KEY (runGroupId) REFERENCES RunGroup(id)
);
