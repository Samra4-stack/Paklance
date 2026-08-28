import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { JazzCashProvider } from './providers/jazzcash.provider';
import { EasypaisaProvider } from './providers/easypaisa.provider';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, JazzCashProvider, EasypaisaProvider],
  exports: [PaymentsService, JazzCashProvider, EasypaisaProvider],
})
export class PaymentsModule {}
