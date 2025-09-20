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
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
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

@ApiTags('VEP Sender')
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
  @ApiOperation({ 
    summary: 'Health check',
    description: 'Verifica el estado de la aplicación'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Aplicación funcionando correctamente',
    schema: {
      type: 'string',
      example: 'Hello World!'
    }
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Delete('deleteSession')
  @ApiOperation({ 
    summary: 'Eliminar sesión de WhatsApp',
    description: 'Elimina la sesión actual de WhatsApp'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Sesión eliminada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Session deleted successfully' }
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Error al eliminar sesión' })
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
  @ApiOperation({ 
    summary: 'Enviar mensaje VEP por WhatsApp',
    description: 'Envía un mensaje con archivo adjunto a través de WhatsApp'
  })
  @ApiBody({ 
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        jid: { type: 'string', example: '5491136585581@s.whatsapp.net', description: 'JID del destinatario' },
        text: { type: 'string', example: 'Hola, aquí tienes tu archivo VEP', description: 'Mensaje de texto' },
        fileName: { type: 'string', example: 'vep_documento.pdf', description: 'Nombre del archivo' },
        archive: { type: 'string', example: 'JVBERi0xLjQK...', description: 'Archivo en base64' },
        media: { type: 'string', example: 'application/pdf', description: 'Tipo de media (opcional)' },
        isGroup: { type: 'boolean', example: false, description: 'Indica si es un grupo (opcional)' }
      },
      required: ['jid', 'text', 'fileName', 'archive']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Mensaje enviado exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Mensaje enviado correctamente' },
        messageId: { type: 'string', example: '3EB0C767D26A8B6A' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - datos inválidos' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
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
  @ApiOperation({ 
    summary: 'Generar código QR de WhatsApp',
    description: 'Genera un código QR para conectar WhatsApp Web'
  })
  @ApiQuery({ 
    name: 'secret', 
    required: true, 
    type: String, 
    description: 'Clave secreta para autenticación',
    example: 'your-secret-key'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Código QR generado exitosamente',
    content: {
      'image/png': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'No autorizado - clave secreta inválida' })
  @ApiResponse({ status: 500, description: 'Error al generar código QR' })
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
      
      // Obtener QR usando el nuevo método (forzar nuevo QR)
      const data = await this.whatsappService.getQrCode(true);
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
  @ApiOperation({ 
    summary: 'Cargar archivo VEP',
    description: 'Sube un archivo PDF de VEP a Digital Ocean Spaces'
  })
  @ApiBody({ 
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        pdf: { type: 'string', example: 'JVBERi0xLjQK...', description: 'Archivo PDF en formato base64' },
        name_pdf: { type: 'string', example: 'vep_documento.pdf', description: 'Nombre del archivo PDF' }
      },
      required: ['pdf', 'name_pdf']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Archivo cargado exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'File uploaded successfully' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error al cargar archivo' })
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
  @ApiOperation({ 
    summary: 'Subir archivos de sesión',
    description: 'Sube archivos de sesión de WhatsApp a Digital Ocean Spaces'
  })
  @ApiBody({ 
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        sessionFiles: { 
          type: 'object', 
          additionalProperties: { type: 'string' },
          example: { 'session': '{"key": "value"}' },
          description: 'Archivos de sesión en formato base64'
        },
        backupCurrent: { 
          type: 'boolean', 
          example: true, 
          description: 'Hacer backup de la sesión actual (opcional)' 
        }
      },
      required: ['sessionFiles']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Archivos de sesión subidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Session files uploaded successfully' },
        uploadedFiles: { 
          type: 'array', 
          items: { type: 'string' },
          example: ['session', 'creds.json']
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - archivos inválidos' })
  @ApiResponse({ status: 500, description: 'Error al subir archivos de sesión' })
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
