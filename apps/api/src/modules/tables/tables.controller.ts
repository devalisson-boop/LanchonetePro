import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TablesService } from './tables.service.js';

@ApiTags('tables')
@ApiBearerAuth()
@Controller('tables')
export class TablesController {
  constructor(@Inject(TablesService) private readonly tablesService: TablesService) {}

  @Get()
  list() {
    return this.tablesService.list();
  }
}
