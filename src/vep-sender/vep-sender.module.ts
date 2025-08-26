import { Module } from '@nestjs/common';
import { VepSenderController } from './vep-sender.controller';
import { VepSenderService } from './vep-sender.service';
import { DigitalOceanService } from 'src/digitalOcean.service';
import { WhatsappService } from 'src/whatsapp.service';
import { SupabaseService } from 'src/supabase.service';

@Module({
  controllers: [VepSenderController],
  providers: [VepSenderService, DigitalOceanService, WhatsappService, SupabaseService],
})
export class VepSenderModule {}
