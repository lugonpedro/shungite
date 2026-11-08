import { describe, expect, it } from "vitest";
import { initialTab } from "./index";

describe("core", () => {
  it("opens the app on the To-Do tab", () => {
    expect(initialTab()).toBe("todo");
  });
});
