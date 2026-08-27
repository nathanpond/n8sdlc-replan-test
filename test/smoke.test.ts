import { describe, expect, it } from "vitest";
import { NAME } from "../src/index.js";

describe("scaffold smoke", () => {
  it("exports the package name", () => {
    expect(NAME).toBe("noteapi");
  });
});
