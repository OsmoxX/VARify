import { Global, Module } from '@nestjs/common';
import { TierService } from './tier.service.js';
import { TierGuard } from './guards/tier.guard.js';
import { LockModule } from './lock/lock.module.js';

@Global()
@Module({
  imports: [LockModule],
  providers: [TierService, TierGuard],
  exports: [TierService, TierGuard, LockModule],
})
export class CommonModule {}
