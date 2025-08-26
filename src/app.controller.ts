import {
  Controller,
  Get,
  Res,
  Query,
  Post,
  Body,
  Logger,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { nowBA, formatBA, getMonthNameBA } from './time.helper';
import { AppService } from './app.service';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import { DigitalOceanService } from './digitalOcean.service';
import { SupabaseService } from './supabase.service';
import { AuthGuard } from './guards/auth.guard';
import { WhatsappService } from './whatsapp.service';
import { VepSchedulerService } from './vep-scheduler.service';
import { VepSenderService } from './vep-sender/vep-sender.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private configService: ConfigService,
    private logger: Logger,
    private digitalOceanService: DigitalOceanService,
    private supabaseService: SupabaseService,
    private readonly whatsappService: WhatsappService,
    private readonly vepSenderService: VepSenderService,
    private readonly vepSchedulerService: VepSchedulerService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Delete('deleteSession')
  async deleteSession(@Res() res: Response): Promise<Response> {
    try {
      await this.whatsappService.deleteSession();
      return res.status(200).json({ message: 'Session deleted successfully' });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error deleting session' });
    }
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
        timestamp: formatBA(nowBA()),
      });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error uploading session' });
    }
  }

  @Get('notSentThisMonth')
  async getNotSentThisMonth(@Res() res: Response): Promise<Response> {
    try {
      const users = await this.supabaseService.getThisMonthNotSentUsers();
      return res.status(200).json(users);
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error fetching users' });
    }
  }

  @Post('sendAllVeps')
  async sendAllVeps(@Res() res: Response): Promise<Response> {
    try {
      const result = await this.vepSenderService.sendAllVeps();
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: error.message || 'Error sending VEP messages' });
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
        timestamp: formatBA(nowBA()),
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
        timestamp: formatBA(nowBA()),
      });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error backing up session' });
    }
  }
}
