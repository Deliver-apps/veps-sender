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

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private configService: ConfigService,
    private logger: Logger,
    private digitalOceanService: DigitalOceanService,
    private supabaseService: SupabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
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
      pdf: Buffer;
      name_pdf: string;
    },
  ): Promise<Response> {
    try {
      const { pdf, name_pdf } = body;
      await this.digitalOceanService.uploadFile(name_pdf, pdf);

      return res.status(200).json({ message: 'File uploaded successfully' });
    } catch (error) {
      this.logger.error(error);
      return res.status(500).json({ error: 'Error loading VEP users' });
    }
  }
}
