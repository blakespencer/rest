export class BankAccountDto {
  id: string;
  plaidAccountId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null; // in cents
  availableBalance: number | null; // in cents
  isoCurrencyCode: string;
}

export class BankConnectionResponseDto {
  id: string;
  institutionId: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: Date | null;
  lastSyncStatus: string | null;
  createdAt: Date;
  accounts: BankAccountDto[];
}
