export class TransactionResponseDto {
  id: string;
  bankAccountId: string;
  plaidTransactionId: string;
  amount: number; // in cents
  isoCurrencyCode: string;
  date: Date;
  name: string;
  merchantName?: string;
  pending: boolean;
  category?: string[];
  paymentChannel?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class TransactionListResponseDto {
  transactions: TransactionResponseDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
