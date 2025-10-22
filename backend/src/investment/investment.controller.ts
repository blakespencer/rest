import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Headers,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvestmentService } from './investment.service';
import {
  CreateInvestmentAccountDto,
  InvestmentAccountResponseDto,
} from './dto/create-account.dto';
import {
  CreateInvestmentOrderDto,
  InvestmentOrderResponseDto,
} from './dto/create-order.dto';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentController {
  constructor(private readonly investmentService: InvestmentService) {}

  /**
   * Create new Seccl investment account
   * POST /investments/accounts
   */
  @Post('accounts')
  async createAccount(
    @Request() req,
    @Body() dto: CreateInvestmentAccountDto,
  ): Promise<InvestmentAccountResponseDto> {
    const userId = req.user?.id;

    return this.investmentService.createAccount(
      userId,
      dto.accountName,
      dto.wrapperType,
    );
  }

  /**
   * Get all investment accounts for user
   * GET /investments/accounts
   */
  @Get('accounts')
  async getAccounts(@Request() req): Promise<InvestmentAccountResponseDto[]> {
    const userId = req.user?.id;

    return this.investmentService.getAccounts(userId);
  }

  /**
   * Get account summary with positions
   * GET /investments/accounts/:id/summary
   */
  @Get('accounts/:id/summary')
  async getAccountSummary(@Request() req, @Param('id') accountId: string) {
    const userId = req.user?.id;

    return this.investmentService.getAccountSummary(userId, accountId);
  }

  /**
   * Create investment order (complete flow)
   * POST /investments/orders
   *
   * Requires Idempotency-Key header to prevent duplicate orders
   */
  @Post('orders')
  async createOrder(
    @Request() req,
    @Body() dto: CreateInvestmentOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<InvestmentOrderResponseDto> {
    const userId = req.user?.id;

    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return this.investmentService.createInvestmentOrder(
      userId,
      dto.secclAccountId,
      dto.amount,
      idempotencyKey,
    );
  }

  /**
   * Get all investment orders for user
   * GET /investments/orders?secclAccountId={accountId}
   */
  @Get('orders')
  async getOrders(
    @Request() req,
    @Query('secclAccountId') secclAccountId?: string,
  ): Promise<InvestmentOrderResponseDto[]> {
    const userId = req.user?.id;

    return this.investmentService.getOrders(userId, secclAccountId);
  }

  /**
   * Get all positions for user
   * GET /investments/positions?secclAccountId={accountId}
   */
  @Get('positions')
  async getPositions(
    @Request() req,
    @Query('secclAccountId') secclAccountId?: string,
  ) {
    const userId = req.user?.id;

    return this.investmentService.getPositions(userId, secclAccountId);
  }
}
