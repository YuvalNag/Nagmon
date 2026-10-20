/**
 * A test fails when anything writes an error or a warning to the console
 * that the test did not expect (docs/app/SDD.md §10): React's own
 * warnings (keys, act, a state update after unmount, StrictMode) show
 * here, since Vitest renders with React's development build. A test that
 * means to log one spies on the console itself.
 */
import { afterEach, beforeEach, expect } from "vitest";

const written: string[] = [];
const real = { error: console.error, warn: console.warn };

beforeEach(() => {
  written.length = 0;
  console.error = (...args: unknown[]) => {
    written.push(`error: ${args.map(String).join(" ")}`);
    real.error.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    written.push(`warn: ${args.map(String).join(" ")}`);
    real.warn.apply(console, args);
  };
});

afterEach(() => {
  console.error = real.error;
  console.warn = real.warn;
  expect(written, "errors or warnings in the console").toEqual([]);
});
