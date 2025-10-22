import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { WrapperType } from '../../seccl/dto/create-account.dto';

export class CreateInvestmentAccountDto {
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @IsEnum(WrapperType)
  wrapperType: WrapperType;
}

export class InvestmentAccountResponseDto {
  id: string;
  secclAccountId: string;
  accountName: string;
  wrapperType: string;
  currency: string;
  cashBalance?: number;
  totalValue?: number;
  status: string;
  positionCount?: number;
  createdAt: Date;
}
