import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
} from 'class-validator';

export class ExecutionDetailsDto {
  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsNumber()
  price: number;

  @IsString()
  @IsNotEmpty()
  transactionTime: string;

  @IsString()
  @IsNotEmpty()
  venue: string;

  @IsNumber()
  executionAmount: number;

  @IsNumber()
  executedQuantity: number;
}

export class CompleteTransactionDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  firmId: string;

  @IsString()
  @IsNotEmpty()
  transactionAction: string;

  @IsString()
  @IsNotEmpty()
  actionReason: string;

  @IsString()
  @IsNotEmpty()
  completedDate: string;

  @IsObject()
  @IsOptional()
  executionDetails?: ExecutionDetailsDto;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  transactionDate?: string;

  @IsString()
  @IsOptional()
  intendedSettlementDate?: string;
}

export class CompleteTransactionResponseDto {
  id: string;
  transactionType: string;
  status: string;
  completedDate: string;
  executionDetails?: ExecutionDetailsDto;
}
