import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangePublicTokenDto {
  @IsString()
  @IsNotEmpty()
  publicToken: string;
}
