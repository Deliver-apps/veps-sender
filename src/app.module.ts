import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { VepSenderModule } from './vep-sender/vep-sender.module';
import supabaseConfig from './config/supabase.config';
import digitalOceanConfig from './config/digitalOcean.config';
import serverConfig from './config/server.config';
import { WhatsappService } from './whatsapp.service';
import { SchedulerService } from './scheduler.service';
import { SupabaseService } from './supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [supabaseConfig, digitalOceanConfig, serverConfig],
    }),
    VepSenderModule,
  ],
  controllers: [AppController],
  providers: [AppService, WhatsappService, SchedulerService, SupabaseService],
})
export class AppModule {}
