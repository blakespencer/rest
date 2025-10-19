import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaidService } from './plaid.service';
import { BankConnectionService } from '../bank-connection/bank-connection.service';
import { LinkTokenResponseDto } from './dto/link-token-response.dto';
import { ExchangePublicTokenDto } from './dto/exchange-public-token.dto';
import { BankConnectionResponseDto } from '../bank-connection/dto/bank-connection-response.dto';

@Controller('plaid')
@UseGuards(JwtAuthGuard)
export class PlaidController {
  constructor(
    private readonly plaidService: PlaidService,
    private readonly bankConnectionService: BankConnectionService,
  ) {}

  /**
   * Create a Plaid Link token
   * POST /plaid/link-token
   */
  @Post('link-token')
  async createLinkToken(@Request() req): Promise<LinkTokenResponseDto> {
    const userId = req.user.id;

    const linkTokenResponse =
      await this.plaidService.createLinkToken(userId);

    return {
      linkToken: linkTokenResponse.link_token,
      expiration: linkTokenResponse.expiration,
    };
  }

  /**
   * Exchange public token for access token and create bank connection
   * POST /plaid/exchange-token
   */
  @Post('exchange-token')
  async exchangePublicToken(
    @Request() req,
    @Body() dto: ExchangePublicTokenDto,
  ): Promise<BankConnectionResponseDto> {
    const userId = req.user.id;

    return this.bankConnectionService.exchangePublicToken(
      userId,
      dto.publicToken,
    );
  }
}
