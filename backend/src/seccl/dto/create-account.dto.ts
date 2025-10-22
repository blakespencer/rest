import { IsString, IsNotEmpty, IsEnum, IsObject } from 'class-validator';

export enum WrapperType {
  ISA = 'ISA',
  GIA = 'GIA',
  PENSION = 'PENSION',
  JISA = 'JISA',
}

export class WrapperDetailDto {
  @IsEnum(WrapperType)
  wrapperType: WrapperType;
}

export class CreateSecclAccountDto {
  @IsString()
  @IsNotEmpty()
  firmId: string;

  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @IsString()
  @IsNotEmpty()
  accountType: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsObject()
  wrapperDetail: WrapperDetailDto;
}

export class CreateSecclAccountResponseDto {
  id: string;
}
