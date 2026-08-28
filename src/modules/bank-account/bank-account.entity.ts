export interface BankAccountProps {
  id: string;
  cardNumber: string;
  cardHolderName: string;
  bankName: string;
  additionalNotes: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * BankAccount Domain Entity.
 * Represents a Card-to-Card transfer destination.
 */
export class BankAccount {
  public readonly id: string;
  public readonly cardNumber: string;
  public readonly cardHolderName: string;
  public readonly bankName: string;
  public readonly additionalNotes: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;

  constructor(props: BankAccountProps) {
    this.id = props.id;
    this.cardNumber = props.cardNumber;
    this.cardHolderName = props.cardHolderName;
    this.bankName = props.bankName;
    this.additionalNotes = props.additionalNotes;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
  }
}
