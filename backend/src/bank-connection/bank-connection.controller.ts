import {
  Controller,
  Get,
  Delete,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankConnectionService } from './bank-connection.service';
import { PlaidService } from '../plaid/plaid.service';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';
import { ExchangePublicTokenDto } from '../plaid/dto/exchange-public-token.dto';
import { LinkTokenResponseDto } from '../plaid/dto/link-token-response.dto';

@Controller('bank-connections')
@UseGuards(JwtAuthGuard)
export class BankConnectionController {
  constructor(
    private readonly bankConnectionService: BankConnectionService,
    private readonly plaidService: PlaidService,
  ) {}

  /**
   * Create a Plaid Link token
   * POST /bank-connections/plaid/link-token
   */
  @Post('plaid/link-token')
  async createLinkToken(@Request() req): Promise<LinkTokenResponseDto> {
    const userId = req.user?.id;

    const linkTokenResponse =
      await this.plaidService.createLinkToken(userId);

    return {
      linkToken: linkTokenResponse.link_token,
      expiration: linkTokenResponse.expiration,
    };
  }

  /**
   * Exchange public token for access token and create bank connection
   * POST /bank-connections/plaid/exchange-token
   */
  @Post('plaid/exchange-token')
  async exchangePublicToken(
    @Request() req,
    @Body() dto: ExchangePublicTokenDto,
  ): Promise<BankConnectionResponseDto> {
    const userId = req.user?.id;

    return this.bankConnectionService.exchangePublicToken(
      userId,
      dto.publicToken,
    );
  }

  /**
   * Get all bank connections for authenticated user
   * GET /bank-connections
   */
  @Get()
  async findAll(@Request() req): Promise<BankConnectionResponseDto[]> {
    const userId = req.user?.id;
    return this.bankConnectionService.findByUserId(userId);
  }

  /**
   * Get single bank connection by ID
   * GET /bank-connections/:id
   */
  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id') id: string,
  ): Promise<BankConnectionResponseDto> {
    const userId = req.user?.id;
    return this.bankConnectionService.findById(userId, id);
  }

  /**
   * Sync bank connection (refresh account balances)
   * POST /bank-connections/:id/sync
   */
  @Post(':id/sync')
  async sync(
    @Request() req,
    @Param('id') id: string,
  ): Promise<BankConnectionResponseDto> {
    const userId = req.user?.id;
    return this.bankConnectionService.sync(userId, id);
  }

  /**
   * Soft delete bank connection
   * DELETE /bank-connections/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Request() req, @Param('id') id: string): Promise<void> {
    const userId = req.user?.id;
    await this.bankConnectionService.delete(userId, id);
  }
}
