export class PositionDto {
  assetId: string;
  assetName: string;
  quantity: number;
  bookValue: number;
  currentValue: number;
  growth: number;
  growthPercent: number;
}

export class RecentTransactionDto {
  id: string;
  transactionType: string;
  status: string;
  amount: number;
  transactionDate: string;
}

export class AccountSummaryDto {
  accountId: string;
  firmId: string;
  accountName: string;
  wrapperType: string;
  currency: string;
  cashBalance: number;
  totalValue: number;
  totalInvested: number;
  totalGrowth: number;
  totalGrowthPercent: number;
  positions: PositionDto[];
  recentTransactions: RecentTransactionDto[];
}
