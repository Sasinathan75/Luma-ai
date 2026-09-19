import type { MessageContent } from "./_core/llm";

export type AssistantIntent = "general" | "architecture" | "image" | "document" | "voice";

const architectureTerms = /\b(architect|architecture|floor ?plan|site plan|elevation|section|facade|façade|building|residential|commercial|institutional|orientation|circulation|ventilation|daylight|stair|staircase|balcony|courtyard|roof|revit|bim|cad|autocad|quantity|bill of quantities|construction|material|space planning|room layout)\b/i;

export function detectIntent(input: string, requested?: AssistantIntent): AssistantIntent {
  if (requested && requested !== "general") return requested;
  return architectureTerms.test(input) ? "architecture" : "general";
}

export function buildSystemPrompt(intent: AssistantIntent) {
  const base = `You are Luma, a general-purpose multimodal AI assistant. Answer in the user's language whenever possible, preserving code and technical notation. Be accurate, helpful, and concise without being shallow. If the request is ambiguous, state what you can and cannot infer. Never claim to have seen details that are not present.`;
  if (intent === "architecture" || intent === "image") {
    return `${base}\n\nArchitecture intelligence is active. For design, building, site, floor-plan, or construction questions, structure the answer with clear headings and practical reasoning. For image analysis, separate: Visible facts, Estimates (only when justified), Assumptions, and Recommendations. Never invent dimensions. For safety-critical structural or construction decisions, recommend verification by a qualified professional.`;
  }
  if (intent === "document") return `${base}\n\nDocument mode is active. Ground your answer in the supplied document context, distinguish quoted facts from interpretation, and say when the file does not contain enough information.`;
  return base;
}

export function toText(content: string | MessageContent | MessageContent[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(toText).join("\n");
  if (content.type === "text") return content.text;
  return "";
}

export function demoResponse(input: string, intent: AssistantIntent, fileName?: string) {
  const cleaned = input.trim() || (fileName ? `Analyze ${fileName}` : "your request");
  if (intent === "architecture") {
    return `## Architecture mode\n\nI can help you reason through **${cleaned}**. A strong next pass would be:\n\n1. **Clarify the brief** — users, site constraints, climate, codes, and budget.\n2. **Test the plan** — adjacency, circulation, orientation, daylight, ventilation, and service access.\n3. **Document assumptions** — call out anything that needs dimensions, surveys, or professional verification.\n\nThis is local demo mode because no AI provider key is configured yet. Add the platform AI credentials to enable live model responses.`;
  }
  if (intent === "image") {
    return `## Image review ready\n\nI received **${fileName ?? "your image"}**. In live mode I will separate visible facts, estimates, assumptions, and recommendations rather than inventing dimensions.\n\nThis is local demo mode because no AI provider key is configured yet.`;
  }
  if (intent === "document") {
    return `## Document workspace ready\n\nI received **${fileName ?? "your document"}**. In live mode I can summarize it, extract key sections, and answer grounded follow-up questions.\n\nThis is local demo mode because no AI provider key is configured yet.`;
  }
  return `Here is a useful starting point for **${cleaned}**:\n\n- Break the request into the goal, constraints, and desired output.\n- Identify what is known versus what needs verification.\n- Choose the simplest next step, then iterate with context.\n\nThis is local demo mode because no AI provider key is configured yet. Add the platform AI credentials to enable live model responses.`;
}
