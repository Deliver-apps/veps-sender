import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import supabaseConfig from './config/supabase.config';
import digitalOceanConfig from './config/digitalOcean.config';
import serverConfig from './config/server.config';
import { WhatsappService } from './whatsapp.service';
import { SchedulerService } from './scheduler.service';
import { SupabaseService } from './supabase.service';
import { DigitalOceanService } from './digitalOcean.service';
import { VepSchedulerService } from './vep-scheduler.service';
import { VepSenderService } from './vep-sender/vep-sender.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [supabaseConfig, digitalOceanConfig, serverConfig],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SupabaseService,
    DigitalOceanService,
    WhatsappService,
    VepSenderService, 
    VepSchedulerService,
    Logger,
  ],
})
export class AppModule {}
