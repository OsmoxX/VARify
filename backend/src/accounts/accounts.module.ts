import { Module } from '@nestjs/common';
import { AccountController, StripeController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

@Module({
  controllers: [StripeController, AccountController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
