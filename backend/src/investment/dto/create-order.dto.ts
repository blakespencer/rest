import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateInvestmentOrderDto {
  @IsString()
  @IsNotEmpty()
  secclAccountId: string;

  @IsNumber()
  @Min(100) // Minimum £1.00 (100 pence)
  amount: number;
}

export class InvestmentOrderResponseDto {
  id: string;
  fundId: string;
  fundName: string | null;
  amount: number;
  currency: string;
  status: string;
  executedAt: Date | null;
  executedQuantity: number | null;
  executionPrice: number | null;
  executedAmount: number | null;
  createdAt: Date;
}
