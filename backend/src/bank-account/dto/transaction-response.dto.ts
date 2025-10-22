export class TransactionResponseDto {
  id: string;
  bankAccountId: string;
  plaidTransactionId: string;
  name: string;
  amount: number; // in cents
  isoCurrencyCode: string;
  date: Date;
  pending: boolean;
  category: string[];
  paymentChannel?: string;
  merchantName?: string;
  createdAt: Date;
  updatedAt: Date;
}
