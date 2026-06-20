// In the extension the backend API is replaced by local compute (Swiss Eph Moshier WASM +
// bundled JSON). This re-exports that drop-in seam, so the rest of the front end is unchanged.
export * from "../src/api-local.js";
