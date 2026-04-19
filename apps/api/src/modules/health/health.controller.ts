import { Controller, Get } from '@nestjs/common';

import { Public } from '../../shared/decorators/public.decorator.js';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'lanchonete-pro-api',
      timestamp: new Date().toISOString(),
    };
  }
}

