export interface SetActiveAccountInput {
  cardNumber: string;
  cardHolderName: string;
  bankName: string;
  additionalNotes?: string | null;
}
