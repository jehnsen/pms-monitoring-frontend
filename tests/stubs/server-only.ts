// The real `server-only` package throws on import outside a React Server
// Components build, which is what keeps server modules out of client bundles.
// Vitest is neither, so both test configs alias it to this empty module.
export {};
