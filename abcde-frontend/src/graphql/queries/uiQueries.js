export function allFoldersQuery() {
  return `{
    allFolders {
      name
      uis {
        name
      }
    }
  }`;
}

export function UIFragment() {
  return `fragment UI on UIGQL {
    name
    sections {
      name
      variableName
      selectedObject {
        name
      }
      selectedModule {
        name
      }
      objects {
        name
      }
      parameters {
        name
      }
      enteredValues {
        values {
          value
          uiType {
            name
          }
          isCurrent
        }
      }
    }
    sectionPositions {
      section {
        name
      }
      position
    }
    availableObjects {
      name
      objects {
        name
        parent {
          name
        }
        parameters {
          name
          defaultVal
          uiType {
            name
          }
          type {
            name
          }
        }
      }
    }
    availableParameters {
      name
      parameters {
        name
        defaultVal
        uiType {
          name
        }
        type {
          name
        }
      }
    }
  }`;
}

export function UIQuery(name) {
  return `{
        fullUi(name: "${name}") {
          ...UI,
          sections {
            children{
              ...UI,
              sections {
                children {
                  ...UI
                }
              }
            }
          }
        }
      }
${UIFragment()}`;
}
