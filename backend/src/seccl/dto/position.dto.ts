export class CgtDataDto {
  realisedProfitLoss: number;
  unrealisedProfitLoss: number;
}

export class PositionTransactionDto {
  transactionId: string;
  transactionCode: string;
  narrative: string;
  postDate: string;
  valueDate: string;
  quantity: number;
  value: number;
  bookValue: number;
  profitLoss: number;
}

export class PositionDetailDto {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  assetId: string;
  assetName: string;
  currency: string;
  firmId: string;
  isin: string;
  nodeId: string;
  positionType: string;
  quantity: number;
  bookValue: number;
  currentValue: number;
  growth: number;
  growthPercent: number;
  cgtData: CgtDataDto;
  instrumentType: string;
  assetCountryOfIssue: string;
  transactions: PositionTransactionDto[];
}
