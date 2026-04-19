import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { StockService } from './stock.service.js';

@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(@Inject(StockService) private readonly stockService: StockService) {}

  @Get('overview')
  getOverview() {
    return this.stockService.getOverview();
  }

  @Get('report')
  getReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('movementType') movementType?: 'in' | 'out' | 'adjustment',
    @Query('itemId') itemId?: string,
  ) {
    return this.stockService.getReport({
      dateFrom,
      dateTo,
      movementType,
      itemId,
    });
  }
}
