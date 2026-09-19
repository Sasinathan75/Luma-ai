import { describe, expect, it } from "vitest";
import { demoResponse, detectIntent } from "./assistant";

describe("assistant intent router", () => {
  it("enhances architecture requests without blocking general questions", () => {
    expect(detectIntent("Can you improve this floor plan?")) .toBe("architecture");
    expect(detectIntent("Explain photosynthesis in simple terms")).toBe("general");
  });

  it("honors an explicit modality context", () => {
    expect(detectIntent("What is visible?", "image")).toBe("image");
    expect(detectIntent("Summarize this", "document")).toBe("document");
  });

  it("makes demo mode explicit and useful", () => {
    const response = demoResponse("a small courtyard home", "architecture");
    expect(response).toContain("Architecture mode");
    expect(response).toContain("local demo mode");
  });
});
