import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { nowBA } from './time.helper';
import { ConfigService } from '@nestjs/config';
import { VepSenderService } from './vep-sender/vep-sender.service';

@Injectable()
export class VepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(VepSchedulerService.name);
  private lastRun: string | null = null;

  constructor(
    private readonly vepSenderService: VepSenderService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    setInterval(() => this.checkAndRun(), 60 * 1000); // cada minuto
  }

  private async checkAndRun() {
    const now = nowBA();
    const hour = Number(this.configService.get('CRON_HOUR', '8'));
    const minute = Number(this.configService.get('CRON_MINUTE', '1'));
    const day = this.configService.get('CRON_DAY', '27');

    // Si el día es *, corre todos los días, si no, solo el día indicado
    const isDayMatch = day === '*' || now.day === Number(day);

    // Evita ejecutar más de una vez por minuto
    const key = `${now.toFormat('yyyy-MM-dd-HH-mm')}`;
    if (isDayMatch && now.hour === hour && now.minute === minute && this.lastRun !== key) {
      this.lastRun = key;
      this.logger.log('Ejecutando envío automático de VEPs (cron interno)');
      try {
        await this.vepSenderService.sendAllVeps();
      } catch (err) {
        this.logger.error('Error en el cron de VEP:', err);
      }
    }
  }
}
