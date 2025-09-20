import { Injectable, Logger } from '@nestjs/common';
import moment from 'moment-timezone';
import { DigitalOceanService } from 'src/digitalOcean.service';
import { SupabaseService } from 'src/supabase.service';
import { formatBA, getMonthNameBA, nowBA } from 'src/time.helper';
import { WhatsappService } from 'src/whatsapp.service';

@Injectable()
export class VepSenderService {
  private readonly logger = new Logger(VepSenderService.name);

  constructor(
    private supabaseService: SupabaseService,
    private digitalOceanService: DigitalOceanService,
    private whatsappService: WhatsappService,
  ) {}

  async sendAllVeps(

  ): Promise<{ message: string; timestamp: string }> {
    this.logger.verbose('Starting to send VEP messages to all users...');
    const users = await this.supabaseService.getVepUsers();
    this.logger.verbose('Fetched users:', users);
    if (!users || users.length === 0) {
      throw new Error('No VEP users found');
    }
    this.logger.verbose(`Found ${users.length} users to send VEP messages to.`);
    const current_month_spanish = getMonthNameBA();
    const today = nowBA();
    const date_to_pay = nowBA().plus({ months: 1 });
    const date_to_pay_spanish = getMonthNameBA(date_to_pay);
    const year_to_pay = date_to_pay.year;
    for (const user of users) {
      const archiveName = `${user.real_name}[${user.cuit}].pdf` ;
      this.logger.verbose(
        `Fetching archive for user: ${user.real_name}[${user.cuit}]`,
      );
      let archives: Array<Buffer> = [];
      try {
        const folderName = `veps_${current_month_spanish}_${year_to_pay}`;
        this.logger.verbose(`Fetching archive from folder: ${folderName}`);
        const archive = await this.digitalOceanService.getFileVeps(
          archiveName,
          folderName,
        );
        archives.push(archive);
        if (user.joined_users && user.joined_users.length > 0) {
          for (const joinedUser of user.joined_users) {
            this.logger.verbose(`Fetching archive from folder: ${folderName}`);
            const archive = await this.digitalOceanService.getFileVeps(
              `${joinedUser.name} [${joinedUser.cuit}].pdf`,
              folderName,
            );
            archives.push(archive);
          }
        }
      } catch (error) {
        this.logger.error(
          `Error fetching archive for user ${user.real_name}[${user.cuit}]:`,
          error,
        );
        continue; // Skip if error fetching archive
      }
      if (!archives || archives?.length === 0) {
        this.logger.warn(
          `No archive found for user ${user.real_name}[${user.cuit}]`,
        );
        continue; // Skip if no archive found
      }
      const message = `Buen día ${user.alter_name} cómo estás ? Te paso el vep de autónomo vence el 5/9\n`;
      let final_message = user.need_papers
        ? message +
          'No te olvides cuando puedas de mandarme los papeles de ventas. Saludos.'
        : message;

      if (user.need_z) {
        final_message += 'No te olvides cuando puedas de mandarme el cierre Z. Saludos.';
      }

      if (user.need_compra) {
        final_message += 'No te olvides cuando puedas de mandarme la factura de compra. Saludos.';
      }
      

      if (user.need_auditoria) {
        final_message += 'No te olvides cuando puedas de mandarme el cierre de auditoria. Saludos.';
      }

      if (archives.length > 0) {
        if(archives.length === 1) {
          await this.whatsappService.sendMessageVep(
            user.mobile_number,
            final_message,
            `VEP-${user.real_name}[${user.cuit}]`,
            archives[0],
            'document',
            user.is_group,
          );
        } else {
          await this.whatsappService.sendMultipleDocuments(
            user.mobile_number,
            final_message,
            archives.map((archive, index) => ({
              archive,
              fileName: "a",//index === 0 ? `VEP-${user.real_name}[${user.cuit}]` : `VEP-${user.joined_with} [${user.joined_cuit}]`,
              mimetype: 'application/pdf',
            })),
            user.is_group,
          );
        }

        await this.supabaseService.updateVepUserLastExecution(
          user.id,
          new Date().toISOString(),
        );
      }
    }
    this.logger.log(
      `Sent VEP messages to ${users.length} users: ${users.map((user) => user.mobile_number).join(', ')}`,
    );
    return {
      message: 'VEP messages sent successfully',
      timestamp: formatBA(nowBA()),
    };
  }
}
