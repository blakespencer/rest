import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TransactionType {
  Payment = 'Payment',
  Order = 'Order',
}

export enum TransactionSubType {
  Deposit = 'Deposit',
  AtBest = 'At Best',
}

export enum MovementType {
  In = 'In',
  Invest = 'Invest',
}

export class TransactionDto {
  @IsString()
  @IsNotEmpty()
  firmId: string;

  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsEnum(TransactionType)
  transactionType: TransactionType;

  @IsEnum(TransactionSubType)
  transactionSubType: TransactionSubType;

  @IsEnum(MovementType)
  movementType: MovementType;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsNumber()
  amount: number;

  @IsString()
  method?: string; // Required for Payment

  @IsString()
  assetId?: string; // Required for Order
}

export class CreateTransactionGroupDto {
  @IsString()
  @IsNotEmpty()
  firmId: string;

  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionDto)
  transactions: TransactionDto[];
}

export class TransactionResponseDto {
  id: string;
  transactionType: TransactionType;
  status: string;
}

export class CreateTransactionGroupResponseDto {
  linkId: string;
  transactions: TransactionResponseDto[];
}
