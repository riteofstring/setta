export const apiVersion = 1;

// The visible Watch Code UI still lives in the host during this staged
// extraction. This frontend entrypoint establishes the plugin-owned build and
// runtime boundary before the canvas control and settings editor move here.
export function register(_host: unknown): void {}
