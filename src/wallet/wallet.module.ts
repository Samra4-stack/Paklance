import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { PayoutMethodsController } from './payout-methods.controller';
import { PayoutMethodsService } from './payout-methods.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WalletController, PayoutMethodsController],
  providers: [WalletService, PayoutMethodsService],
  exports: [WalletService, PayoutMethodsService],
})
export class WalletModule {}

