// The package compiles its own scoped stylesheet and imports no CSS of its own. One dependency
// ships markup that only its stylesheet can lay out — KaTeX, for the Text section's rendered math
// — and the reference imports it the same way. This declaration is only what teaches `tsc` that
// such a side-effect import resolves; the package defines no CSS modules.
declare module "*.css";
