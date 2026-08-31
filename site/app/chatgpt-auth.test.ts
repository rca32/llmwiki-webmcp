import { describe, expect, it } from "vitest";
import { chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";

describe("ChatGPT sign-in paths", () => {
  it("preserves a safe same-origin return path", () => {
    expect(chatGPTSignInPath("/notes/123?tab=activity")).toBe(
      "/signin-with-chatgpt?return_to=%2Fnotes%2F123%3Ftab%3Dactivity",
    );
  });

  it("falls back to root for external or reserved return paths", () => {
    expect(chatGPTSignInPath("https://example.com/private")).toBe(
      "/signin-with-chatgpt?return_to=%2F",
    );
    expect(chatGPTSignInPath("/callback?code=secret")).toBe(
      "/signin-with-chatgpt?return_to=%2F",
    );
  });

  it("uses the dispatcher-owned sign-out route", () => {
    expect(chatGPTSignOutPath("/")).toBe("/signout-with-chatgpt?return_to=%2F");
  });
});
