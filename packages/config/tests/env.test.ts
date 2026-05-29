import assert from "node:assert/strict";
import test from "node:test";
import { readLogLevel, readNumberEnv, readStringEnv } from "../src/index.js";

test("readStringEnv returns fallback for missing or blank values", () => {
  assert.equal(readStringEnv({}, "MISSING", "fallback"), "fallback");
  assert.equal(readStringEnv({ VALUE: " " }, "VALUE", "fallback"), "fallback");
  assert.equal(readStringEnv({ VALUE: "set" }, "VALUE", "fallback"), "set");
});

test("readNumberEnv parses numeric environment values", () => {
  assert.equal(readNumberEnv({ PORT: "4788" }, "PORT", 3000), 4788);
  assert.throws(() => readNumberEnv({ PORT: "abc" }, "PORT", 3000));
});

test("readLogLevel validates known log levels", () => {
  assert.equal(readLogLevel({ MEMO_CAPTURE_LOG_LEVEL: "debug" }), "debug");
  assert.throws(() => readLogLevel({ MEMO_CAPTURE_LOG_LEVEL: "verbose" }));
});
