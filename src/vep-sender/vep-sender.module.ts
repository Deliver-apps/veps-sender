import { Module } from '@nestjs/common';
import { VepSenderController } from './vep-sender.controller';
import { VepSenderService } from './vep-sender.service';
import { DigitalOceanController } from './digital-ocean.controller';
import { AuthController } from './auth.controller';
import { VepUsersController } from './vep-users.controller';
import { JobTimeController } from './job-time.controller';
import { DigitalOceanService } from 'src/digitalOcean.service';
import { SupabaseService } from 'src/supabase.service';
import { WhatsappService } from 'src/whatsapp.service';
import { AppService } from 'src/app.service';
import { DigitalOceanAuthGuard } from 'src/guards/digital-ocean-auth.guard';

@Module({
  controllers: [VepSenderController, DigitalOceanController, AuthController, VepUsersController, JobTimeController],
  providers: [VepSenderService, DigitalOceanService, SupabaseService, WhatsappService, AppService, DigitalOceanAuthGuard],
})
export class VepSenderModule {}
