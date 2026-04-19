import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type.js';
import { CashRegisterService } from './cash-register.service.js';
import { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto.js';
import { OpenCashSessionDto } from './dto/open-cash-session.dto.js';

@ApiTags('cash-register')
@ApiBearerAuth()
@Controller('cash-register')
export class CashRegisterController {
  constructor(@Inject(CashRegisterService) private readonly cashRegisterService: CashRegisterService) {}

  @Get()
  getOverview() {
    return this.cashRegisterService.getOverview();
  }

  @Get('transactions')
  listTransactions(
    @Query('sessionId') sessionId?: string,
    @Query('transactionType')
    transactionType?: 'opening_float' | 'sale' | 'refund' | 'cash_in' | 'cash_out',
    @Query('paymentMethod') paymentMethod?: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'voucher',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.cashRegisterService.listTransactions({
      sessionId,
      transactionType,
      paymentMethod,
      dateFrom,
      dateTo,
    });
  }

  @Post('open')
  openSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenCashSessionDto,
  ) {
    return this.cashRegisterService.openSession(user, dto);
  }

  @Post('transactions')
  createTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCashTransactionDto,
  ) {
    return this.cashRegisterService.createTransaction(user, dto);
  }

  @Post('close')
  closeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.cashRegisterService.closeSession(user, dto);
  }
}
