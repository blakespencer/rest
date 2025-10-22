export class BankAccountResponseDto {
  id: string;
  bankConnectionId: string;
  plaidAccountId: string;
  name: string;
  officialName?: string;
  type: string;
  subtype?: string;
  mask?: string;
  currentBalance: number; // in cents
  availableBalance: number; // in cents
  isoCurrencyCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ConsolidatedBalanceDto {
  totalAvailable: number; // in cents
  totalCurrent: number; // in cents
  currency: string;
  accountCount: number;
  accounts: Array<{
    id: string;
    name: string;
    mask?: string;
    availableBalance: number;
    currentBalance: number;
  }>;
}
