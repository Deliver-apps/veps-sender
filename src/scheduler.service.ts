import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import * as moment from 'moment-timezone';
import { SupabaseService } from './supabase.service';
import { WhatsappService } from './whatsapp.service';
import { DigitalOceanService } from './digitalOcean.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private supabaseService: SupabaseService,
    private whatsappService: WhatsappService,
    private digitalOceanService: DigitalOceanService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    const cront_time = this.configService.get<string>('server.cront_time');
    // Schedule a cron job to run at 2:39 AM Argentina time
    new CronJob(
      cront_time ?? '1 8 5 * *', // Cron syntax (https://crontab.guru/)
      async () => {
        try {
          // 1) Set the locale to Spanish
          moment.locale('es');

          // 2) Set the default timezone
          const timeZone = 'America/Argentina/Buenos_Aires';
          moment.tz.setDefault(timeZone);

          const users = await this.supabaseService.getVepUsers();
          if (!users || users.length === 0) {
            throw new Error('No se pudieron obtener los usuarios de VEP');
          }
          const current_month_spanish = moment().format('MMMM');
          const today = new Date();
          const date_to_pay = moment().add(1, 'month').format('MMMM');

          for (const user of users) {
            const folderName = `veps_${current_month_spanish}_${today.getFullYear()}`;
            const archive: Buffer = await this.digitalOceanService.getFileVeps(
              `${user.real_name} [${user.cuit}].pdf`,
              folderName,
            );
            if (!archive) {
              continue; // Skip if no archive found
            }
            console.log(archive);
            const message = `Hola ${user.alter_name}, buenos días, cómo estás?. Te paso el VEP del mes ${current_month_spanish}, vence en ${date_to_pay}. \n`;
            const final_message = user.need_papers
              ? message +
                'No te olvides cuando puedas de mandarme los papeles de ventas. Saludos.'
              : message;

            await this.whatsappService.sendMessageVep(
              user.mobile_number,
              final_message,
              `VEP-${today.getMilliseconds()})`,
              archive,
              'document',
              false,
            );
            console.table(users)
            // Update last_execution date in Supabase
            await this.supabaseService.updateVepUserLastExecution(
              user.id,
              moment().format('YYYY-MM-DD HH:mm:ss'),
            );
          }
          this.logger.log(
            `Cron job triggered at ${moment().format()}, sending messages to ${users.length} users, ${users.map((user) => user.mobile_number).join(', ')}`,
          );
        } catch (error) {
          this.logger.error(`Error in cron job: ${error.message}`, error.stack);
        }
      },
      null, // On complete (optional, leave null if not needed)
      true, // Start immediately
      'America/Argentina/Buenos_Aires', // Set timezone to Argentina
    );

    this.logger.log('Cron job initialized with Argentina timezone');
  }
}
