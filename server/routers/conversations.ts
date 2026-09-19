import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createConversation,
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
  renameConversation,
} from "../db";

import { publicProcedure, router } from "../_core/trpc";

function requireUser(ctx: { user?: { id: number } | null }) {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Please log in to manage conversations.",
    });
  }

  return ctx.user;
}

export const conversationsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const user = requireUser(ctx);

    return await listConversations(user.id);
  }),

  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(160).default("New Chat"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = requireUser(ctx);

      const id = await createConversation(user.id, input.title);

      if (!id) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create conversation.",
        });
      }

      return {
        id,
        title: input.title.slice(0, 160),
      };
    }),

  get: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = requireUser(ctx);

      const conversation = await getConversation(user.id, input.id);

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found.",
        });
      }

      return conversation;
    }),

  messages: publicProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = requireUser(ctx);

      const conversation = await getConversation(
        user.id,
        input.conversationId
      );

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found.",
        });
      }

      return await getMessages(user.id, input.conversationId);
    }),

  rename: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(160),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = requireUser(ctx);

      const conversation = await getConversation(user.id, input.id);

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found.",
        });
      }

      const success = await renameConversation(
        user.id,
        input.id,
        input.title
      );

      return {
        success,
      };
    }),

  delete: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = requireUser(ctx);

      const conversation = await getConversation(user.id, input.id);

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found.",
        });
      }

      const success = await deleteConversation(user.id, input.id);

      return {
        success,
      };
    }),
});