/**
 * Importing this module registers every ported generator in `GENERATORS`
 * (each module calls `register` when it loads).
 */
import "./algebra";
import "./arithmetic";
import "./english";
import "./geometry";
import "./logic";
import "./rational";
import "./word_problems";

export { GENERATORS } from "./common";
