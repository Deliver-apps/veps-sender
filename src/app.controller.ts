import {
  Controller,
  Get,
  Res,
  Query,
  Post,
  Body,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { AppService } from './app.service';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import { DigitalOceanService } from './digitalOcean.service';
import { SupabaseService } from './supabase.service';
import { AuthGuard } from './guards/auth.guard';
import { WhatsappService } from './whatsapp.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private configService: ConfigService,
    private logger: Logger,
    private digitalOceanService: DigitalOceanService,
    private supabaseService: SupabaseService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('sendMessageVep')
  async sendMessageVepTest(
    @Res() res: Response,
    @Body()
    body: {
      jid: string;
      text: string;
      fileName: string;
      archive: string;
      media?: string;
      isGroup?: boolean;
    },
  ): Promise<Response> {
    console.log('Received body:', body);
    try {
      const { jid, text, fileName, archive, media, isGroup } = body;
      const archiveBuffer = Buffer.from(archive, 'base64');
      const result = await this.whatsappService.sendMessageVep(
        jid,
        text,
        fileName,
        archiveBuffer,
        media,
        isGroup,
      );
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error sending message' });
    }
  }

  @Get('qr')
  async getQrCode(
    @Res() res: Response,
    @Query('secret') secret: string,
  ): Promise<Response> {
    try {
      const secret_key_login = this.configService.get<string>(
        'server.secret_key_login',
      );
      if (secret !== secret_key_login) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const data = this.appService.getQrCode();
      const stringToEncode = data || 'Hello World!';

      // Generate a PNG buffer from the input string
      const qrBuffer = await QRCode.toBuffer(stringToEncode, {
        type: 'png',
        errorCorrectionLevel: 'M', // or 'L', 'H', etc.
      });

      // Set content type to image/png
      res.type('image/png');
      // Send the buffer (this is the actual image data)
      return res.send(qrBuffer);
    } catch (e) {
      console.error('Error generating QR code:', e);
      return res.status(500).json({ error: 'Failed to generate QR code' });
    }
  }

  @UseGuards(AuthGuard)
  @Post('loadVep')
  async loadVep(
    @Res() res: Response,
    @Body()
    body: {
      pdf: string;
      name_pdf: string;
    },
  ): Promise<Response> {
    try {
      const { pdf, name_pdf } = body;
      const pdfBuffer = Buffer.from(pdf, 'base64');
      await this.digitalOceanService.uploadFile(name_pdf, pdfBuffer);

      return res.status(200).json({ message: 'File uploaded successfully' });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error loading VEP users' });
    }
  }

  @Post('uploadSession')
  async uploadSession(
    @Res() res: Response,
    @Body()
    body: {
      sessionFiles: { [fileName: string]: string };
      backupCurrent?: boolean;
    },
  ): Promise<Response> {
    try {
      const { sessionFiles, backupCurrent } = body;
      
      // Opción para hacer backup de la sesión actual antes de subir la nueva
      if (backupCurrent) {
        await this.whatsappService.backupCurrentSession();
      }
      
      await this.whatsappService.uploadSession(sessionFiles);
      return res.status(200).json({ 
        message: 'Session uploaded successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error uploading session' });
    }
  }

  @Post('sendAllVeps')
  async sendAllVeps(@Res() res: Response): Promise<Response> {
    try {
      const users = await this.supabaseService.getVepUsers();
      if (!users || users.length === 0) {
        return res.status(404).json({ error: 'No VEP users found' });
      }
      const current_month_spanish = new Date().toLocaleString('es-AR', { month: 'long' });
      const today = new Date();
      const date_to_pay = new Date();
      date_to_pay.setMonth(date_to_pay.getMonth() + 1);
      const date_to_pay_spanish = date_to_pay.toLocaleString('es-AR', { month: 'long' });
      for (const user of users) {
        const archive: Buffer = await this.digitalOceanService.getFile(
          `${user.real_name} [${user.cuit}].pdf`,
        );
        if (!archive) {
          this.logger.warn(`No archive found for user ${user.real_name} (${user.cuit})`);
          continue; // Skip if no archive found
        }
        const message = `Hola ${user.alter_name}, buenos días, cómo estás?. Te paso el VEP del mes ${current_month_spanish}, vence en ${date_to_pay_spanish}. \n`;
        const final_message = user.need_papers
          ? message + 'No te olvides cuando puedas de mandarme los papeles de ventas. Saludos.'
          : message;

        await this.whatsappService.sendMessageVep(
          user.mobile_number,
          final_message,
          `VEP-${today.getMilliseconds()})`,
          archive,
          'document',
          user.is_group,
        );
      }
      this.logger.log(
        `Sent VEP messages to ${users.length} users: ${users.map((user) => user.mobile_number).join(', ')}`,
      );
      return res.status(200).json({
        message: 'VEP messages sent successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error sending VEP messages' });
    }
  }

  @Post('downloadSession')
  async downloadSession(
    @Res() res: Response,
    @Body()
    body: {
      sessionFileName?: string;
    },
  ): Promise<Response> {
    try {
      const { sessionFileName } = body;
      await this.whatsappService.downloadSession(sessionFileName);
      return res.status(200).json({ 
        message: 'Session downloaded successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error downloading session' });
    }
  }

  @Post('backupSession')
  async backupSession(@Res() res: Response): Promise<Response> {
    try {
      const backupFileName = await this.whatsappService.backupCurrentSession();
      return res.status(200).json({ 
        message: 'Session backed up successfully',
        fileName: backupFileName,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error backing up session' });
    }
  }
}
