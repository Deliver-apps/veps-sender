import { Module } from '@nestjs/common';
import { VepSenderController } from './vep-sender.controller';
import { VepSenderService } from './vep-sender.service';

@Module({
  controllers: [VepSenderController],
  providers: [VepSenderService],
})
export class VepSenderModule {}
