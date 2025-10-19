import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankConnectionService } from './bank-connection.service';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';

@Controller('bank-connections')
@UseGuards(JwtAuthGuard)
export class BankConnectionController {
  constructor(
    private readonly bankConnectionService: BankConnectionService,
  ) {}

  /**
   * Get all bank connections for authenticated user
   * GET /bank-connections
   */
  @Get()
  async findAll(@Request() req): Promise<BankConnectionResponseDto[]> {
    const userId = req.user.id;
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
    const userId = req.user.id;
    return this.bankConnectionService.findById(userId, id);
  }

  /**
   * Soft delete bank connection
   * DELETE /bank-connections/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Request() req, @Param('id') id: string): Promise<void> {
    const userId = req.user.id;
    await this.bankConnectionService.delete(userId, id);
  }
}
