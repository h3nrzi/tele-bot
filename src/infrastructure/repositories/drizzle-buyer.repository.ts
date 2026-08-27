import { eq, sql } from 'drizzle-orm';
import { users } from '@/db/schema/users';
import { getDefaultDb } from '@/db/client';
import type { DbExecutor } from '@/infrastructure/db/types';
import { Buyer } from '@/domain/buyer/buyer.entity';
import type {
  IBuyerRepository,
  UpsertBuyerResult,
} from '@/domain/buyer/buyer.repository';

export class DrizzleBuyerRepository implements IBuyerRepository<DbExecutor> {
  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? getDefaultDb();
  }

  public async findById(id: string, executor?: DbExecutor): Promise<Buyer | null> {
    const db = this.getDb(executor);
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row) {
      return null;
    }
    return new Buyer({
      id: row.id,
      telegramChatId: row.telegramChatId,
      telegramUsername: row.telegramUsername,
      createdAt: row.createdAt,
    });
  }

  public async findByTelegramChatId(
    chatId: bigint,
    executor?: DbExecutor
  ): Promise<Buyer | null> {
    const db = this.getDb(executor);
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.telegramChatId, chatId));
    if (!row) {
      return null;
    }
    return new Buyer({
      id: row.id,
      telegramChatId: row.telegramChatId,
      telegramUsername: row.telegramUsername,
      createdAt: row.createdAt,
    });
  }

  public async upsert(
    data: { telegramChatId: bigint; telegramUsername?: string | null },
    executor?: DbExecutor
  ): Promise<UpsertBuyerResult> {
    const db = this.getDb(executor);
    const username = data.telegramUsername ?? null;

    const [row] = await db
      .insert(users)
      .values({
        telegramChatId: data.telegramChatId,
        telegramUsername: username,
      })
      .onConflictDoUpdate({
        target: users.telegramChatId,
        set: {
          telegramChatId: data.telegramChatId,
        },
      })
      .returning({
        id: users.id,
        telegramChatId: users.telegramChatId,
        telegramUsername: users.telegramUsername,
        createdAt: users.createdAt,
        isInserted: sql<boolean>`(xmax = 0)`.as('is_inserted'),
      });

    if (!row) {
      throw new Error('Failed to insert or update buyer');
    }

    return {
      buyer: new Buyer({
        id: row.id,
        telegramChatId: row.telegramChatId,
        telegramUsername: row.telegramUsername,
        createdAt: row.createdAt,
      }),
      isInserted: Boolean(row.isInserted),
    };
  }
}

export const buyerRepository = new DrizzleBuyerRepository();
