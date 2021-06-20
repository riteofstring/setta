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
          modules{
          name
        }
          parameters{
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
      sectionPositions{
      section{
        name
      }
      position
    }
    availableModules {
        name
        modules {
          name
          objects {
            name
            parameters {
              name
              defaultVal
              uiType{
                name
              }
              type{
                name
              }
              
            }
          }
        }
      }
    availableParameters {
        name
        parameters {
          name
          defaultVal
          uiType{
            name
          }
          type{
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
