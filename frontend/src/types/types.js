/**
 * @typedef {Object} SectionPosition
 * @property {number} x - The x coordinate
 * @property {number} y - The y coordinate
 */

/**
 * @typedef {'SECTION'|'GROUP'|'TEXT_BLOCK'|'CODE'} SectionUIType
 */

/**
 * @typedef {Object} SimplifiedSectionConfig
 * @property {string} name - The section title
 * @property {SectionSize} [size] - The section dimensions (optional)
 * @property {SectionPosition} position
 * @property {SectionUIType} type
 * @property {boolean} [renderMarkdown]
 */
/**
@typedef {string} ID
 */

/**
 * @typedef {Object} SimplifiedCodeInfo
 * @property {ID} id
 * @property {string} name
 * @property {string} description
 */

/**
 * @typedef {Object} SectionSimplifiedCodeInfo
 * @property {SimplifiedCodeInfo} callableInfo
 * @property {Array<SimplifiedCodeInfo>} paramInfos
 */

/**
 * @typedef {Object} SimplifiedSectionInfo
 * @property {string} name
 * @property {string} type
 * @property {SectionSimplifiedCodeInfo} codeInfo
 * @property {SectionPosition} position
 * @property {SectionSize} size
 */

/**
 * @typedef {Object} ReactFlowPaneRect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} SectionPositionAndSize
 * @property {ID} id
 * @property {SectionPosition} [position]
 * @property {SectionSize} [size]
 */
