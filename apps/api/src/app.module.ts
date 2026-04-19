import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { AuthController } from './modules/auth/auth.controller.js';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { AuthService } from './modules/auth/auth.service.js';
import { CashRegisterController } from './modules/cash-register/cash-register.controller.js';
import { CashRegisterService } from './modules/cash-register/cash-register.service.js';
import { DashboardController } from './modules/dashboard/dashboard.controller.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { CategoriesController } from './modules/menu/categories.controller.js';
import { CategoriesService } from './modules/menu/categories.service.js';
import { IngredientsController } from './modules/menu/ingredients.controller.js';
import { IngredientsService } from './modules/menu/ingredients.service.js';
import { ProductsController } from './modules/menu/products.controller.js';
import { ProductsService } from './modules/menu/products.service.js';
import { OrdersController } from './modules/orders/orders.controller.js';
import { OrdersService } from './modules/orders/orders.service.js';
import { ProfilesController } from './modules/profiles/profiles.controller.js';
import { ProfilesService } from './modules/profiles/profiles.service.js';
import { StockController } from './modules/stock/stock.controller.js';
import { StockService } from './modules/stock/stock.service.js';
import { TablesController } from './modules/tables/tables.controller.js';
import { TablesService } from './modules/tables/tables.service.js';
import { validateEnv } from './shared/config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
  ],
  controllers: [
    AuthController,
    CashRegisterController,
    CategoriesController,
    DashboardController,
    HealthController,
    IngredientsController,
    OrdersController,
    ProductsController,
    ProfilesController,
    StockController,
    TablesController,
  ],
  providers: [
    AuthService,
    CashRegisterService,
    CategoriesService,
    DashboardService,
    IngredientsService,
    OrdersService,
    ProductsService,
    ProfilesService,
    StockService,
    TablesService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
