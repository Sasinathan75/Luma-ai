import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { addAttachment, addMessage, getConversation } from "../db";
import { invokeLLM, type Message } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { ENV } from "../_core/env";
import { storageGetSignedUrl, storagePut } from "../storage";
import { buildSystemPrompt, demoResponse, detectIntent, toText, type AssistantIntent } from "../assistant";
import { publicProcedure, router } from "../_core/trpc";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
const dataUriSchema = z.string().regex(/^data:[^;]+;base64,[a-zA-Z0-9+/=\r\n]+$/).max(15_000_000);
const historySchema = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) })).max(30);
const attachmentSchema = z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().min(1).max(120), dataUri: dataUriSchema, size: z.number().int().positive().max(MAX_FILE_BYTES) });

function decodeDataUri(dataUri: string) {
  const match = dataUri.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid file payload." });
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_FILE_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Files must be 10 MB or smaller." });
  return { mimeType: match[1], buffer };
}

function assertFile(kind: "image" | "document" | "audio", mimeType: string, fileName: string) {
  const allowed = kind === "image" ? ["image/jpeg", "image/png", "image/webp"] : kind === "document" ? ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] : ["audio/webm", "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/x-m4a"];
  const extension = fileName.toLowerCase().split(".").pop();
  const validExtension = kind === "image" ? ["jpg", "jpeg", "png", "webp"] : kind === "document" ? ["pdf", "txt", "docx"] : ["webm", "mp3", "wav", "ogg", "m4a", "mp4"];
  if (!allowed.includes(mimeType) || !extension || !validExtension.includes(extension)) throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported ${kind} file type.` });
}

async function maybePersistAttachment(ctx: any, conversationId: number | undefined, attachment: z.infer<typeof attachmentSchema>, kind: "image" | "document" | "audio") {
  if (!ctx.user) return null;
  const { buffer } = decodeDataUri(attachment.dataUri);
  const stored = await storagePut(`${ctx.user.id}/attachments/${safeName(attachment.fileName)}`, buffer, attachment.mimeType);
  await addAttachment({ userId: ctx.user.id, conversationId: conversationId ?? null, fileName: attachment.fileName, mimeType: attachment.mimeType, kind, storageKey: stored.key, storageUrl: stored.url });
  return stored;
}

const responseText = (result: Awaited<ReturnType<typeof invokeLLM>>) => toText(result.choices[0]?.message?.content ?? "");
const historyMessages = (history: z.infer<typeof historySchema>): Message[] => history.map(message => ({ role: message.role, content: message.content }));

async function persistExchange(ctx: any, conversationId: number | undefined, userText: string, assistantText: string, attachmentJson?: string) {
  if (!ctx.user || !conversationId) return;
  const conversation = await getConversation(ctx.user.id, conversationId);
  if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
  await addMessage({ conversationId, role: "user", content: userText || "Attached file", attachmentJson });
  await addMessage({ conversationId, role: "assistant", content: assistantText });
}

export const aiRouter = router({
  chat: publicProcedure.input(z.object({ conversationId: z.number().int().positive().optional(), prompt: z.string().min(1).max(20_000), history: historySchema.default([]), requestedIntent: z.enum(["general", "architecture", "voice"]).optional() })).mutation(async ({ ctx, input }) => {
    const intent = detectIntent(input.prompt, input.requestedIntent as AssistantIntent | undefined);
    let answer = demoResponse(input.prompt, intent);
    let demo = true;
    if (ENV.forgeApiKey) {
      try {
        const result = await invokeLLM({ messages: [{ role: "system", content: buildSystemPrompt(intent) }, ...historyMessages(input.history), { role: "user", content: input.prompt }], maxTokens: 800 });
        answer = responseText(result) || answer;
        demo = false;
      } catch (error) {
        console.error("[AI] chat failed, falling back to demo:", error);
      }
    }
    await persistExchange(ctx, input.conversationId, input.prompt, answer);
    return { answer, intent, demo };
  }),
  vision: publicProcedure.input(z.object({ conversationId: z.number().int().positive().optional(), prompt: z.string().max(20_000).default("Describe and analyze this image."), history: historySchema.default([]), attachment: attachmentSchema })).mutation(async ({ ctx, input }) => {
    assertFile("image", input.attachment.mimeType, input.attachment.fileName);
    const stored = await maybePersistAttachment(ctx, input.conversationId, input.attachment, "image");
    const intent = detectIntent(input.prompt, "image");
    let answer = demoResponse(input.prompt, intent, input.attachment.fileName);
    let demo = true;
    if (ENV.forgeApiKey) {
      try {
        const result = await invokeLLM({ messages: [{ role: "system", content: buildSystemPrompt(intent) }, ...historyMessages(input.history), { role: "user", content: [{ type: "text", text: input.prompt || "Describe this image." }, { type: "image_url", image_url: { url: input.attachment.dataUri, detail: "auto" } }] }], maxTokens: 1600 });
        answer = responseText(result) || answer;
        demo = false;
      } catch (error) {
        console.error("[AI] vision failed, falling back to demo:", error);
      }
    }
    await persistExchange(ctx, input.conversationId, input.prompt || `Analyze ${input.attachment.fileName}`, answer, stored ? JSON.stringify({ fileName: input.attachment.fileName, url: stored.url, mimeType: input.attachment.mimeType }) : undefined);
    return { answer, intent, demo, attachment: { fileName: input.attachment.fileName, mimeType: input.attachment.mimeType, url: stored?.url } };
  }),
  document: publicProcedure.input(z.object({ conversationId: z.number().int().positive().optional(), prompt: z.string().max(20_000).default("Summarize this document and highlight key information."), history: historySchema.default([]), attachment: attachmentSchema, extractedText: z.string().max(100_000).optional() })).mutation(async ({ ctx, input }) => {
    assertFile("document", input.attachment.mimeType, input.attachment.fileName);
    const stored = await maybePersistAttachment(ctx, input.conversationId, input.attachment, "document");
    const intent = detectIntent(input.prompt, "document");
    let answer = demoResponse(input.prompt, intent, input.attachment.fileName);
    let demo = true;
    if (ENV.forgeApiKey) {
      try {
        const signedUrl = stored ? await storageGetSignedUrl(stored.key) : undefined;
        const filePart = signedUrl ? [{ type: "file_url", file_url: { url: signedUrl, mime_type: input.attachment.mimeType as any } }] : [];
        const textContext = input.extractedText ? `\n\nExtracted text:\n${input.extractedText}` : "";
        const result = await invokeLLM({ messages: [{ role: "system", content: buildSystemPrompt(intent) }, ...historyMessages(input.history), { role: "user", content: [{ type: "text", text: `${input.prompt}${textContext}` }, ...filePart] as any }], maxTokens: 1800 });
        answer = responseText(result) || answer;
        demo = false;
      } catch (error) {
        console.error("[AI] document failed, falling back to demo:", error);
      }
    }
    await persistExchange(ctx, input.conversationId, input.prompt || `Analyze ${input.attachment.fileName}`, answer, stored ? JSON.stringify({ fileName: input.attachment.fileName, url: stored.url, mimeType: input.attachment.mimeType }) : undefined);
    return { answer, intent, demo, attachment: { fileName: input.attachment.fileName, mimeType: input.attachment.mimeType, url: stored?.url } };
  }),
  transcribe: publicProcedure.input(z.object({ attachment: attachmentSchema, language: z.string().max(12).optional() })).mutation(async ({ ctx, input }) => {
    assertFile("audio", input.attachment.mimeType, input.attachment.fileName);
    const stored = await maybePersistAttachment(ctx, undefined, input.attachment, "audio");
    if (!ENV.forgeApiKey || !stored) return { text: "", demo: true };
    const signedUrl = await storageGetSignedUrl(stored.key);
    const result = await transcribeAudio({ audioUrl: signedUrl, language: input.language });
    if ("error" in result) throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
    return { text: result.text ?? "", demo: false };
  }),
});
