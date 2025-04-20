/**
 * @typedef {Object} Position
 * @property {number} x - The x coordinate
 * @property {number} y - The y coordinate
 */

/**
 * @typedef {Object} SectionSize
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {'SECTION'|'LIST_ROOT'|'DICT_ROOT'|'GROUP'|'IMAGE'|'CHART'|'DRAW'|'TEXT_BLOCK'|'SOCIAL'|'GLOBAL_VARIABLES'|'CODE'|'PARAM_SWEEP'|'TERMINAL'|'GLOBAL_PARAM_SWEEP'|'IFRAME'|'CHAT'} SectionUIType
 */

/**
 * @typedef {Object} SimplifiedSectionConfig
 * @property {string} name - The section title
 * @property {SectionSize} size - The section dimensions
 * @property {Position} position
 * @property {SectionUIType} type
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
 */
