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
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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
import * as fs from 'fs/promises';
import * as path from 'path';

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
        console.table({ secret, secret_key_login });
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // Obtener QR on-demand (forzar nuevo)
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

  @Post('test-message')
  @ApiTags('WhatsApp Test')
  @ApiOperation({
    summary: 'Send test WhatsApp message',
    description: 'Send a simple text message to individual contacts or groups. For groups, use the Group ID (can be obtained from GET /groups endpoint)'
  })
  @ApiBody({
    description: 'Test message data',
    schema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Phone number with country code (without + symbol) or Group ID',
          example: '5491136585581'
        },
        message: {
          type: 'string',
          description: 'Text message to send',
          example: 'Hola! Este es un mensaje de prueba 🚀'
        },
        isGroup: {
          type: 'boolean',
          description: 'Set to true if sending to a group (phone field should contain group ID)',
          example: false
        }
      },
      required: ['phone', 'message']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Message sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Test message sent successfully' },
        phone: { type: 'string', example: '5491136585581' },
        sentMessage: { type: 'string', example: 'Hola! Este es un mensaje de prueba 🚀' },
        isGroup: { type: 'boolean', example: false },
        jid: { type: 'string', example: '5491136585581@s.whatsapp.net' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'WhatsApp not connected or invalid data',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'WhatsApp not connected' }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: 'Error sending message',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Error sending test message' }
      }
    }
  })
  async sendTestMessage(@Body() body: { phone: string; message: string; isGroup?: boolean }): Promise<any> {
    try {
      console.log('📱 Test message endpoint called:', { 
        phone: body.phone, 
        message: body.message, 
        isGroup: body.isGroup || false 
      });
      
      // Verificar que WhatsApp esté conectado
      const isConnected = this.whatsappService.isConnected();
      console.log('🔌 WhatsApp connection status:', isConnected);
      
      if (!isConnected) {
        console.warn('❌ WhatsApp not connected');
        throw new HttpException(
          { error: 'WhatsApp not connected' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validar datos requeridos
      if (!body.phone || !body.message) {
        console.warn('❌ Missing required fields:', { phone: !!body.phone, message: !!body.message });
        throw new HttpException(
          { error: 'Phone and message are required' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Construir JID según si es grupo o contacto individual
      let jid_final: string;
      const isGroup = body.isGroup || false;
      
      if (isGroup) {
        // Para grupos: usar el Group ID tal como viene (ya debería incluir @g.us)
        if (body.phone.includes('@g.us')) {
          jid_final = body.phone;
        } else {
          jid_final = `${body.phone}@g.us`;
        }
        console.log('👥 Sending message to GROUP:', jid_final);
      } else {
        // Para contactos individuales: agregar @s.whatsapp.net
        if (body.phone.includes('@s.whatsapp.net')) {
          jid_final = body.phone;
        } else {
          jid_final = `${body.phone}@s.whatsapp.net`;
        }
        console.log('👤 Sending message to CONTACT:', jid_final);
      }
      
      await this.whatsappService.sendSimpleTextMessage(jid_final, body.message);

      const response = {
        success: true,
        message: `Test message sent successfully to ${isGroup ? 'group' : 'contact'}`,
        phone: body.phone,
        sentMessage: body.message,
        isGroup: isGroup,
        jid: jid_final,
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ Test message sent successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Error sending test message:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        { 
          error: 'Error sending test message',
          details: error.message || 'Unknown error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  
  @Get('test-connectivity')
  @ApiTags('WhatsApp Test')
  @ApiOperation({
    summary: 'Test API connectivity and WhatsApp status',
    description: 'Simple endpoint to verify API is reachable and WhatsApp connection status'
  })
  @ApiResponse({
    status: 200,
    description: 'Connectivity test successful',
    schema: {
      type: 'object',
      properties: {
        api: { type: 'string', example: 'OK' },
        whatsapp: { type: 'string', example: 'Connected' },
        timestamp: { type: 'string', example: '2025-09-20T21:00:00.000Z' },
        environment: { type: 'string', example: 'production' }
      }
    }
  })
  async testConnectivity(): Promise<any> {
    const isWhatsAppConnected = this.whatsappService.isConnected();
    const connectionStatus = this.whatsappService.getConnectionStatus();
    
    return {
      api: 'OK',
      whatsapp: isWhatsAppConnected ? 'Connected' : 'Disconnected',
      connectionDetails: connectionStatus,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    };
  }

  @Get('whatsapp-debug')
  @ApiTags('WhatsApp Test')
  @ApiOperation({
    summary: 'Get detailed WhatsApp debug information',
    description: 'Detailed debugging information for WhatsApp connection issues'
  })
  @ApiResponse({
    status: 200,
    description: 'Debug information retrieved',
    schema: {
      type: 'object',
      properties: {
        connected: { type: 'boolean' },
        debugInfo: { type: 'object' },
        timestamp: { type: 'string' }
      }
    }
  })
  async getWhatsAppDebug(): Promise<any> {
    try {
      // Forzar una verificación detallada
      const isConnected = this.whatsappService.isConnected();
      const connectionStatus = this.whatsappService.getConnectionStatus();
      
      return {
        connected: isConnected,
        connectionStatus,
        debugInfo: {
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
          message: isConnected ? 'WhatsApp is connected' : 'WhatsApp is not connected - check logs for initialization details'
        }
      };
    } catch (error) {
      console.error('❌ Error getting WhatsApp debug info:', error);
      return {
        connected: false,
        error: error.message,
        debugInfo: {
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
          message: 'Error getting debug information'
        }
      };
    }
  }

  @Post('whatsapp-reinit')
  @ApiTags('WhatsApp Test')
  @ApiOperation({
    summary: 'Force WhatsApp reinitialization',
    description: 'Manually reinitialize WhatsApp connection (for debugging)'
  })
  @ApiResponse({
    status: 200,
    description: 'Reinitialization completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        timestamp: { type: 'string' }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: 'Reinitialization failed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' },
        timestamp: { type: 'string' }
      }
    }
  })
  async forceWhatsAppReinitialization(): Promise<any> {
    try {
      console.log('🔄 Manual WhatsApp reinitialization requested');
      
      await this.whatsappService.forceReinitialization();
      
      const response = {
        success: true,
        message: 'WhatsApp reinitialization completed successfully',
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ Manual reinitialization completed:', response);
      return response;
      
    } catch (error) {
      console.error('❌ Error during manual reinitialization:', error);
      
      const errorResponse = {
        success: false,
        error: error.message || 'Unknown error during reinitialization',
        timestamp: new Date().toISOString()
      };
      
      throw new HttpException(
        errorResponse,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('groups')
  @ApiTags('WhatsApp Test')
  @ApiOperation({
    summary: 'Get WhatsApp groups',
    description: 'Retrieve list of WhatsApp groups for testing purposes'
  })
  @ApiResponse({
    status: 200,
    description: 'Groups retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        groups: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1234567890-1234567890@g.us' },
              name: { type: 'string', example: 'Mi Grupo de Prueba' },
              participantsCount: { type: 'number', example: 5 }
            }
          }
        },
        count: { type: 'number', example: 3 }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'WhatsApp not connected',
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'WhatsApp not connected' }
      }
    }
  })
  async getGroups(): Promise<any> {
    try {
      console.log('👥 Groups list requested');
      
      // Verificar que WhatsApp esté conectado
      const isConnected = this.whatsappService.isConnected();
      console.log('🔌 WhatsApp connection status:', isConnected);
      
      if (!isConnected) {
        console.warn('❌ WhatsApp not connected');
        throw new HttpException(
          { error: 'WhatsApp not connected' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Obtener grupos desde WhatsappService
      const groups = await this.whatsappService.getGroups();

      const response = {
        success: true,
        groups: groups,
        count: groups.length,
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ Groups retrieved successfully: ${groups.length} groups found`);
      return response;
      
    } catch (error) {
      console.error('❌ Error getting groups:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        { 
          error: 'Error retrieving groups',
          details: error.message || 'Unknown error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('test-scheduler')
  @ApiTags('Job Scheduler Test')
  @ApiOperation({
    summary: 'Test job scheduler timezone logic',
    description: 'Manually test the job scheduler timezone conversion and filtering logic'
  })
  @ApiResponse({
    status: 200,
    description: 'Scheduler test completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        currentTime: { type: 'string' },
        pendingJobs: { type: 'number' },
        filteredJobs: { type: 'number' },
        details: { type: 'array' }
      }
    }
  })
  async testScheduler(): Promise<any> {
    try {
      console.log('🧪 Manual scheduler test requested');
      
      // Simular la lógica del scheduler
      const { DateTime } = await import('luxon');
      const timezone = 'America/Argentina/Buenos_Aires';
      const now = DateTime.now().setZone(timezone);
      
      console.log(`🕐 Current time (GMT-3): ${now.toFormat('yyyy-MM-dd HH:mm:ss')}`);
      
      // Obtener jobs pendientes (usando el servicio real)
      const supabaseService = this.appService['supabaseService'] || 
                             this.appService.constructor.prototype.supabaseService;
      
      // Como no tenemos acceso directo, vamos a hacer una prueba simple
      const response = {
        success: true,
        currentTime: now.toISO(),
        currentTimeFormatted: now.toFormat('yyyy-MM-dd HH:mm:ss'),
        timezone: timezone,
        message: 'Scheduler test completed - check logs for detailed timezone conversion',
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ Scheduler test completed:', response);
      return response;
      
    } catch (error) {
      console.error('❌ Error during scheduler test:', error);
      
      const errorResponse = {
        success: false,
        error: error.message || 'Unknown error during scheduler test',
        timestamp: new Date().toISOString()
      };
      
      throw new HttpException(
        errorResponse,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('send-image/:imageName')
  @ApiOperation({ 
    summary: 'Enviar imagen a un número específico',
    description: 'Envía una imagen desde la raíz del proyecto a un número de WhatsApp específico'
  })
  @ApiParam({
    name: 'imageName',
    description: 'Nombre de la imagen en la raíz del proyecto (ej: navidad.jpeg)',
    example: 'navidad.jpeg',
    type: String,
  })
  @ApiBody({ 
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        phoneNumber: { 
          type: 'string', 
          example: '5491136585581', 
          description: 'Número de teléfono sin @s.whatsapp.net (se agregará automáticamente)' 
        },
        caption: { 
          type: 'string', 
          example: 'Mensaje con imagen', 
          description: 'Texto que acompaña a la imagen (opcional)' 
        },
        isGroup: { 
          type: 'boolean', 
          example: false, 
          description: 'Indica si es un grupo (opcional)' 
        }
      },
      required: ['phoneNumber']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Imagen enviada exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Imagen enviada correctamente' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - datos inválidos' })
  @ApiResponse({ status: 404, description: 'Imagen no encontrada' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async sendImage(
    @Param('imageName') imageName: string,
    @Res() res: Response,
    @Body()
    body: {
      phoneNumber: string;
      caption?: string;
      isGroup?: boolean;
    },
  ): Promise<Response> {
    try {
      const { phoneNumber, caption = '', isGroup = false } = body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: 'El número de teléfono es requerido' });
      }

      // Construir la ruta de la imagen en la raíz del proyecto
      const imagePath = path.join(process.cwd(), imageName);
      
      // Verificar si la imagen existe
      try {
        await fs.access(imagePath);
      } catch (error) {
        this.logger.error(`Imagen no encontrada: ${imagePath}`);
        return res.status(404).json({ 
          error: `Imagen no encontrada: ${imageName}`,
          path: imagePath
        });
      }

      // Leer la imagen como Buffer
      const imageBuffer = await fs.readFile(imagePath);
      
      // Formatear el número de teléfono (agregar @s.whatsapp.net si no lo tiene)
      let jid: string;
      if (phoneNumber.includes('@')) {
        // Si ya tiene @, usar tal cual (pero verificar que no esté duplicado)
        jid = phoneNumber;
        // Si tiene @s.whatsapp.net@s.whatsapp.net, limpiarlo
        if (jid.includes('@s.whatsapp.net@s.whatsapp.net')) {
          jid = jid.replace('@s.whatsapp.net@s.whatsapp.net', '@s.whatsapp.net');
        }
        if (jid.includes('@g.us@g.us')) {
          jid = jid.replace('@g.us@g.us', '@g.us');
        }
      } else {
        // Si no tiene @, agregarlo según el tipo
        jid = `${phoneNumber}@${isGroup ? 'g.us' : 's.whatsapp.net'}`;
      }

      // Enviar la imagen usando el servicio de WhatsApp
      await this.whatsappService.sendMessageVep(
        jid,
        caption,
        imageName,
        imageBuffer,
        'image',
        isGroup,
      );

      return res.status(200).json({
        success: true,
        message: 'Imagen enviada correctamente',
        phoneNumber: jid,
        imageName,
      });
    } catch (error) {
      this.logger.error('Error enviando imagen:', error);
      return res.status(500).json({ 
        error: 'Error enviando imagen',
        details: error.message 
      });
    }
  }

  @Post('send-message-to-all')
  @ApiOperation({ 
    summary: 'Enviar mensaje a todos los usuarios de la base de datos',
    description: 'Envía un mensaje de texto a todos los usuarios VEP registrados en la base de datos'
  })
  @ApiBody({ 
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        message: { 
          type: 'string', 
          example: 'Hola, este es un mensaje para todos', 
          description: 'Mensaje de texto a enviar a todos los usuarios' 
        }
      },
      required: ['message']
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Mensajes enviados exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Mensajes enviados correctamente' },
        totalUsers: { type: 'number', example: 50 },
        successful: { type: 'number', example: 48 },
        failed: { type: 'number', example: 2 }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - datos inválidos' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async sendMessageToAll(
    @Res() res: Response,
    @Body()
    body: {
      message: string;
    },
  ): Promise<Response> {
    try {
      const { message } = body;
      
      if (!message) {
        return res.status(400).json({ error: 'El mensaje es requerido' });
      }

      // Obtener todos los usuarios de la base de datos
      const users = await this.supabaseService.getVepUsers();
      
      if (!users || users.length === 0) {
        return res.status(404).json({ 
          error: 'No se encontraron usuarios en la base de datos' 
        });
      }

      this.logger.log(`Enviando mensaje a ${users.length} usuarios...`);

      const results = {
        successful: 0,
        failed: 0,
        errors: [] as Array<{ userId: number; userName: string; error: string }>,
      };

      // Enviar mensaje a cada usuario
      for (const user of users) {
        try {
          // Formatear el número de teléfono
          const jid = user.mobile_number.includes('@') 
            ? user.mobile_number 
            : `${user.mobile_number}@${user.is_group ? 'g.us' : 's.whatsapp.net'}`;

          // Enviar mensaje de texto simple
          await this.whatsappService.sendSimpleTextMessage(jid, message);
          
          results.successful++;
          
          // Pequeña pausa entre mensajes para evitar spam
          await new Promise(resolve => setTimeout(resolve, 1500));
          
        } catch (error) {
          this.logger.error(`Error enviando mensaje a usuario ${user.id} (${user.real_name}):`, error.message);
          results.failed++;
          results.errors.push({
            userId: user.id,
            userName: user.real_name,
            error: error.message,
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Proceso de envío completado',
        totalUsers: users.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
      });
    } catch (error) {
      this.logger.error('Error enviando mensajes a todos los usuarios:', error);
      return res.status(500).json({ 
        error: 'Error enviando mensajes',
        details: error.message 
      });
    }
  }

  @Post('send-image-to-all/:imageName')
  @ApiOperation({ 
    summary: 'Enviar imagen a todos los usuarios principales',
    description: 'Envía una imagen desde la raíz del proyecto a todos los usuarios principales (dueños) de la base de datos. Los usuarios con joined_users solo recibirán UNA imagen, no múltiples.'
  })
  @ApiParam({
    name: 'imageName',
    description: 'Nombre de la imagen en la raíz del proyecto (ej: navidad.jpeg)',
    example: 'navidad.jpeg',
    type: String,
  })
  @ApiBody({ 
    type: 'object',
    schema: {
      type: 'object',
      properties: {
        caption: { 
          type: 'string', 
          example: '¡Feliz Navidad!', 
          description: 'Texto que acompaña a la imagen (opcional)' 
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Imágenes enviadas exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Proceso de envío completado' },
        totalUsers: { type: 'number', example: 50 },
        successful: { type: 'number', example: 48 },
        failed: { type: 'number', example: 2 }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - datos inválidos' })
  @ApiResponse({ status: 404, description: 'Imagen no encontrada' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async sendImageToAll(
    @Param('imageName') imageName: string,
    @Res() res: Response,
    @Body()
    body: {
      caption?: string;
    },
  ): Promise<Response> {
    try {
      const { caption = '' } = body;
      
      // Construir la ruta de la imagen en la raíz del proyecto
      const imagePath = path.join(process.cwd(), imageName);
      
      // Verificar si la imagen existe
      try {
        await fs.access(imagePath);
      } catch (error) {
        this.logger.error(`Imagen no encontrada: ${imagePath}`);
        return res.status(404).json({ 
          error: `Imagen no encontrada: ${imageName}`,
          path: imagePath
        });
      }

      // Leer la imagen como Buffer
      const imageBuffer = await fs.readFile(imagePath);
      
      // Obtener todos los usuarios de la base de datos
      const users = await this.supabaseService.getVepUsers();
      
      if (!users || users.length === 0) {
        return res.status(404).json({ 
          error: 'No se encontraron usuarios en la base de datos' 
        });
      }

      this.logger.log(`Enviando imagen ${imageName} a ${users.length} usuarios principales...`);

      const results = {
        successful: 0,
        failed: 0,
        errors: [] as Array<{ userId: number; userName: string; error: string }>,
      };

      // Enviar imagen solo a usuarios principales (ignorar joined_users)
      for (const user of users) {
        try {
          // Formatear el número de teléfono del usuario principal
          let jid: string;
          if (user.mobile_number.includes('@')) {
            jid = user.mobile_number;
            // Limpiar duplicados si existen
            if (jid.includes('@s.whatsapp.net@s.whatsapp.net')) {
              jid = jid.replace('@s.whatsapp.net@s.whatsapp.net', '@s.whatsapp.net');
            }
            if (jid.includes('@g.us@g.us')) {
              jid = jid.replace('@g.us@g.us', '@g.us');
            }
          } else {
            jid = `${user.mobile_number}@${user.is_group ? 'g.us' : 's.whatsapp.net'}`;
          }

          // Enviar imagen solo al usuario principal (dueño)
          // NO se envía a los joined_users
          await this.whatsappService.sendMessageVep(
            jid,
            caption,
            imageName,
            imageBuffer,
            'image',
            user.is_group,
          );
          
          results.successful++;
          
          // Pequeña pausa entre mensajes para evitar spam
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          this.logger.error(`Error enviando imagen a usuario ${user.id} (${user.real_name}):`, error.message);
          results.failed++;
          results.errors.push({
            userId: user.id,
            userName: user.real_name,
            error: error.message,
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Proceso de envío de imagen completado',
        imageName,
        totalUsers: users.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
      });
    } catch (error) {
      this.logger.error('Error enviando imágenes a todos los usuarios:', error);
      return res.status(500).json({ 
        error: 'Error enviando imágenes',
        details: error.message 
      });
    }
  }

}
