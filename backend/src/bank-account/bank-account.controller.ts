import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankAccountService } from './bank-account.service';
import {
  BankAccountResponseDto,
  ConsolidatedBalanceDto,
} from './dto/bank-account-response.dto';
import { TransactionListResponseDto } from '../transaction/dto/transaction-response.dto';

@Controller('bank-accounts')
@UseGuards(JwtAuthGuard)
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  /**
   * Get all bank accounts for authenticated user
   * GET /bank-accounts
   */
  @Get()
  async findAll(@Request() req): Promise<BankAccountResponseDto[]> {
    const userId = req.user?.id;
    return this.bankAccountService.findByUserId(userId);
  }

  /**
   * Get consolidated balance across all accounts
   * GET /bank-accounts/consolidated-balance?currency=USD
   */
  @Get('consolidated-balance')
  async getConsolidatedBalance(
    @Request() req,
    @Query('currency') currency?: string,
  ): Promise<ConsolidatedBalanceDto> {
    const userId = req.user?.id;
    return this.bankAccountService.getConsolidatedBalance(
      userId,
      currency || 'USD',
    );
  }

  /**
   * Get transactions for a bank account
   * GET /bank-accounts/:id/transactions?page=1&pageSize=50
   */
  @Get(':id/transactions')
  async getTransactions(
    @Request() req,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<TransactionListResponseDto> {
    const userId = req.user?.id;
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 50;

    return this.bankAccountService.getTransactions(
      userId,
      id,
      parsedPage,
      parsedPageSize,
    );
  }

  /**
   * Get single bank account by ID
   * GET /bank-accounts/:id
   */
  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id') id: string,
  ): Promise<BankAccountResponseDto> {
    const userId = req.user?.id;
    return this.bankAccountService.findById(userId, id);
  }
}
