export interface BuyerProps {
  id: string;
  telegramChatId: bigint;
  telegramUsername: string | null;
  createdAt: Date;
}

/**
 * Buyer Domain Entity.
 * Represents a registered Telegram user in the system.
 */
export class Buyer {
  public readonly id: string;
  public readonly telegramChatId: bigint;
  public readonly telegramUsername: string | null;
  public readonly createdAt: Date;

  constructor(props: BuyerProps) {
    this.id = props.id;
    this.telegramChatId = props.telegramChatId;
    this.telegramUsername = props.telegramUsername;
    this.createdAt = props.createdAt;
  }

  public getDisplayName(): string {
    if (this.telegramUsername) {
      return `@${this.telegramUsername}`;
    }
    return `ID: ${this.telegramChatId.toString()}`;
  }
}
