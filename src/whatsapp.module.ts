import { Global, Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AppService } from './app.service';
import { DigitalOceanService } from './digitalOcean.service';

@Global()
@Module({
  providers: [WhatsappService, AppService, DigitalOceanService],
  exports: [WhatsappService, AppService, DigitalOceanService],
})
export class WhatsappModule {}
