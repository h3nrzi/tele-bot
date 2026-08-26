import { vi } from 'vitest';
import type { Context } from 'grammy';

export interface MockSender {
  id: number;
  first_name?: string;
  username?: string;
}

export interface CreateMockContextOptions {
  match?: string;
  text?: string;
}

export interface MockContextResult {
  ctx: Context;
  repliedMessages: string[];
}

/**
 * Creates a mock grammY Context for testing command handlers.
 */
export function createMockContext(
  from?: MockSender,
  options?: CreateMockContextOptions
): MockContextResult {
  const repliedMessages: string[] = [];
  const fromUser = from
    ? {
        id: from.id,
        is_bot: false,
        first_name: from.first_name ?? '',
        username: from.username,
      }
    : undefined;

  const ctx = {
    from: fromUser,
    match: options?.match,
    message: options?.text
      ? {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: from?.id ?? 1, type: 'private' },
          from: fromUser,
          text: options.text,
        }
      : undefined,
    reply: vi.fn(async (text: string) => {
      repliedMessages.push(text);
    }),
  } as unknown as Context;

  return { ctx, repliedMessages };
}

export interface MockSentPhoto {
  chat_id: number | string;
  photo: string;
  caption?: string;
  reply_markup?: any;
}

export interface MockEditedMessage {
  chat_id?: number | string;
  message_id?: number;
  inline_message_id?: string;
  text?: string;
  caption?: string;
  reply_markup?: any;
}

export interface MockAnsweredCallbackQuery {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}

/**
 * Creates a mock fetch function that captures sent messages/photos and returns valid Telegram API responses.
 */
export function createMockFetch(
  repliedMessages: string[] = [],
  sentPhotos: MockSentPhoto[] = [],
  editedMessages: MockEditedMessage[] = [],
  answeredCallbackQueries: MockAnsweredCallbackQuery[] = []
): {
  fetch: typeof fetch;
  repliedMessages: string[];
  sentPhotos: MockSentPhoto[];
  editedMessages: MockEditedMessage[];
  answeredCallbackQueries: MockAnsweredCallbackQuery[];
} {
  let messageId = 1;
  const mockFetch: typeof fetch = async (url: any, init?: any) => {
    const urlStr = url.toString();
    const method = urlStr.split('/').pop();
    let body: any = {};
    if (init?.body) {
      try {
        body = JSON.parse(init.body);
      } catch {}
    }
    if (method === 'sendMessage') {
      if (body.text) {
        repliedMessages.push(body.text);
      }
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: messageId++,
            date: Math.floor(Date.now() / 1000),
            chat: { id: body.chat_id, type: 'private' },
            text: body.text,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (method === 'sendPhoto') {
      if (body.caption) {
        repliedMessages.push(body.caption);
      }
      sentPhotos.push({
        chat_id: body.chat_id,
        photo: body.photo,
        caption: body.caption,
        reply_markup: body.reply_markup,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: messageId++,
            date: Math.floor(Date.now() / 1000),
            chat: { id: body.chat_id, type: 'private' },
            photo: [{ file_id: body.photo, width: 100, height: 100 }],
            caption: body.caption,
            reply_markup: body.reply_markup,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (method === 'editMessageCaption') {
      if (body.caption) {
        repliedMessages.push(body.caption);
      }
      editedMessages.push({
        chat_id: body.chat_id,
        message_id: body.message_id,
        caption: body.caption,
        reply_markup: body.reply_markup,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: body.message_id ?? 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: body.chat_id ?? 1, type: 'private' },
            caption: body.caption,
            reply_markup: body.reply_markup,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (method === 'editMessageText') {
      if (body.text) {
        repliedMessages.push(body.text);
      }
      editedMessages.push({
        chat_id: body.chat_id,
        message_id: body.message_id,
        text: body.text,
        reply_markup: body.reply_markup,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: body.message_id ?? 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: body.chat_id ?? 1, type: 'private' },
            text: body.text,
            reply_markup: body.reply_markup,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (method === 'answerCallbackQuery') {
      answeredCallbackQueries.push({
        callback_query_id: body.callback_query_id,
        text: body.text,
        show_alert: body.show_alert,
      });
      return new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { fetch: mockFetch, repliedMessages, sentPhotos, editedMessages, answeredCallbackQueries };
}

/**
 * Intercepts outbound sendMessage API calls on a grammY Bot instance and collects sent message texts into an array.
 */
export function captureBotReplies(bot: { api: { config: { use: Function } } }): string[] {
  const repliedMessages: string[] = [];
  bot.api.config.use(async (prev: any, method: string, payload: any, signal: any) => {
    if (method === 'sendMessage') {
      repliedMessages.push(payload.text);
      return {
        ok: true,
        result: {
          message_id: 1,
          date: Date.now(),
          chat: { id: payload.chat_id, type: 'private' },
          text: payload.text,
        },
      } as any;
    }
    return prev(method, payload, signal);
  });
  return repliedMessages;
}

