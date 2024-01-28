"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNextVariantOffset = exports.createRenderDimensions = exports.treatGlyphAsBackgroundColor = exports.isRestrictedPowerlineGlyph = exports.isPowerlineGlyph = exports.throwIfFalsy = void 0;
function throwIfFalsy(value) {
    if (!value) {
        throw new Error('value must not be falsy');
    }
    return value;
}
exports.throwIfFalsy = throwIfFalsy;
function isPowerlineGlyph(codepoint) {
    return 0xE0A4 <= codepoint && codepoint <= 0xE0D6;
}
exports.isPowerlineGlyph = isPowerlineGlyph;
function isRestrictedPowerlineGlyph(codepoint) {
    return 0xE0B0 <= codepoint && codepoint <= 0xE0B7;
}
exports.isRestrictedPowerlineGlyph = isRestrictedPowerlineGlyph;
function isBoxOrBlockGlyph(codepoint) {
    return 0x2500 <= codepoint && codepoint <= 0x259F;
}
function treatGlyphAsBackgroundColor(codepoint) {
    return isPowerlineGlyph(codepoint) || isBoxOrBlockGlyph(codepoint);
}
exports.treatGlyphAsBackgroundColor = treatGlyphAsBackgroundColor;
function createRenderDimensions() {
    return {
        css: {
            canvas: createDimension(),
            cell: createDimension()
        },
        device: {
            canvas: createDimension(),
            cell: createDimension(),
            char: {
                width: 0,
                height: 0,
                left: 0,
                top: 0
            }
        }
    };
}
exports.createRenderDimensions = createRenderDimensions;
function createDimension() {
    return {
        width: 0,
        height: 0
    };
}
function computeNextVariantOffset(cellWidth, lineWidth, currentOffset = 0) {
    return (cellWidth - (Math.round(lineWidth) * 2 - currentOffset)) % (Math.round(lineWidth) * 2);
}
exports.computeNextVariantOffset = computeNextVariantOffset;
//# sourceMappingURL=RendererUtils.js.map