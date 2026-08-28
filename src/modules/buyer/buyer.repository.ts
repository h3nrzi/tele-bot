import { injectable, inject } from 'tsyringe';
import { eq, sql } from 'drizzle-orm';
import { users } from '@/modules/buyer/buyer.schema';
import { getDefaultDb, type DbClient } from '@/core/database/client';
import type { DbExecutor } from '@/core/database/types';
import { Buyer } from '@/modules/buyer/buyer.entity';
import type {
  IBuyerRepository,
  UpsertBuyerResult,
} from '@/modules/buyer/buyer.repository.interface';
import { TOKENS } from '@/core/di/tokens';

@injectable()
export class DrizzleBuyerRepository implements IBuyerRepository<DbExecutor> {
  constructor(
    @inject(TOKENS.DbClient) private readonly defaultDb?: DbClient
  ) {}

  private getDb(executor?: DbExecutor): DbExecutor {
    return executor ?? this.defaultDb ?? getDefaultDb();
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
          telegramUsername: username,
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

export const BuyerRepository = DrizzleBuyerRepository;

