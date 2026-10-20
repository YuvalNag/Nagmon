/**
 * Importing this module registers every ported generator in `GENERATORS`
 * (each module calls `register` when it loads).
 */
import "./arithmetic";
import "./english";

export { GENERATORS } from "./common";
