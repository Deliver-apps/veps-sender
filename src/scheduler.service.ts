import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import * as moment from 'moment-timezone';
import { SupabaseService } from './supabase.service';
import { WhatsappService } from './whatsapp.service';
import { readFileSync } from 'node:fs';
import * as path from 'path';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private supabaseService: SupabaseService,
    private whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    this.logger.warn('Enviando mensajes a WhatsApp');
    // Schedule a cron job to run at 2:39 AM Argentina time
    new CronJob(
      '*/15 * * * *', // Cron syntax (https://crontab.guru/)
      async () => {
        // 1) Set the locale to Spanish
        moment.locale('es');

        // 2) Set the default timezone
        const timeZone = 'America/Argentina/Buenos_Aires';
        moment.tz.setDefault(timeZone);

        const users = await this.supabaseService.getVepUsers();
        const current_month_spanish = moment().format('MMMM');
        const today = new Date();
        const date_to_pay = moment().add(1, 'month').format('MMMM');
        const pdf_path = path.join(__dirname, 'assets', 'pdf2.pdf');
        console.log(pdf_path);
        const archive = readFileSync(pdf_path);

        for (const user of users) {
          const message = `Hola ${user.alter_name}, buenos días, cómo estás?. Te paso el VEP del mes ${current_month_spanish}, vence en ${date_to_pay}. \n`;
          const final_message = user.need_papers
            ? message +
              'No te olvides cuando puedas de mandarme los papeles de ventas. Saludos.'
            : message;

          console.table({
            user: user.alter_name,
            message: final_message,
            number: user.mobile_number,
          });

          await this.whatsappService.sendMessageVep(
            user.mobile_number,
            final_message,
            `VEP-${today.getMilliseconds()})`,
            archive,
            'document',
            false,
          );
        }
        this.logger.log(
          `Cron job triggered at ${moment().format()}, sending messages to ${users.length} users, ${users.map((user) => user.mobile_number).join(', ')}`,
        );
      },
      null, // On complete (optional, leave null if not needed)
      true, // Start immediately
      'America/Argentina/Buenos_Aires', // Set timezone to Argentina
    );

    this.logger.log('Cron job initialized with Argentina timezone');
  }
}
