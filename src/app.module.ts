import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import supabaseConfig from './config/supabase.config';
import digitalOceanConfig from './config/digitalOcean.config';
import serverConfig from './config/server.config';
import { SupabaseService } from './supabase.service';
import { DigitalOceanService } from './digitalOcean.service';
import { VepSchedulerService } from './vep-scheduler.service';
import { VepSenderService } from './vep-sender/vep-sender.service';
import { VepSenderModule } from './vep-sender/vep-sender.module';
import { SwaggerController } from './swagger.controller';
import { JobTimeSchedulerService } from './job-time-scheduler.service';
import { JobTimeSchedulerController } from './job-time-scheduler.controller';
import { WhatsappModule } from './whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [supabaseConfig, digitalOceanConfig, serverConfig],
    }),
    WhatsappModule,
    VepSenderModule,
  ],
  controllers: [AppController, SwaggerController, JobTimeSchedulerController],
  providers: [
    AppService,
    SupabaseService,
    DigitalOceanService,
    VepSenderService, 
    VepSchedulerService,
    JobTimeSchedulerService,
    Logger,
  ],
})
export class AppModule {}
