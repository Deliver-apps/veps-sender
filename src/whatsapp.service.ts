import { Injectable, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { AppService } from './app.service';
import { DigitalOceanService } from './digitalOcean.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { nowBA } from './time.helper';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private socket: ReturnType<typeof makeWASocket>;
  private sessionData: any;
  private SESSION_DIR: string = './session';
  private qrAttempts: number = 0;
  private maxQrAttempts: number = 6; // Más realista para usuarios
  private isInitialized: boolean = false;
  private connectionState: 'connecting' | 'connected' | 'disconnected' = 'disconnected';

  constructor(
    private appService: AppService,
    private digitalOceanService: DigitalOceanService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Solo inicializar si no está ya inicializado
    if (this.isInitialized) {
      return;
    }

    let hasValidSession = false;

    // Verificar si existe la carpeta session localmente y contiene archivos válidos
    try {
      await fs.access(this.SESSION_DIR);
      
      // Verificar si la carpeta contiene archivos de sesión válidos
      const files = await fs.readdir(this.SESSION_DIR);
      const hasValidFiles = files.some(file => 
        file === 'creds.json' || file.startsWith('session-')
      );
      
      if (hasValidFiles) {
        console.log('✅ Carpeta session con archivos válidos encontrada localmente, no se descargará de DigitalOcean');
        hasValidSession = true;
      } else {
        console.log('⚠️ Carpeta session existe pero está vacía o sin archivos válidos, intentando descargar de DigitalOcean...');
        
        // Solo descargar si no hay archivos válidos
        try {
          await this.downloadLatestSession();
          console.log('✅ Sesión descargada exitosamente de DigitalOcean');
          hasValidSession = true;
        } catch (downloadError) {
          console.log('❌ No existing session found in cloud or download failed, starting fresh');
          hasValidSession = false;
        }
      }
    } catch (error) {
      console.log('❌ No se encontró carpeta session localmente, intentando descargar de DigitalOcean...');
      
      // Solo descargar si no existe localmente
      try {
        await this.downloadLatestSession();
        console.log('✅ Sesión descargada exitosamente de DigitalOcean');
        hasValidSession = true;
      } catch (downloadError) {
        console.log('❌ No existing session found in cloud or download failed, starting fresh');
        hasValidSession = false;
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.SESSION_DIR);
    
    // Verificar si la sesión local es válida
    if (state.creds && state.creds.me) {
      console.log('✅ Sesión local válida encontrada');
      hasValidSession = true;
    } else {
      console.log('❌ No hay sesión local válida');
      hasValidSession = false;
    }

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      // Configuraciones adicionales para mejorar la estabilidad
      connectTimeoutMs: 60000, // 60 segundos
      keepAliveIntervalMs: 30000, // 30 segundos
      retryRequestDelayMs: 250, // 250ms entre reintentos
      maxMsgRetryCount: 5, // Máximo 5 reintentos por mensaje
      markOnlineOnConnect: true,
      browser: ['VEP Sender', 'Chrome', '4.0.0'],
    });
     
    // Enhance saveCreds to auto-backup to cloud
    const originalSaveCreds = saveCreds;
    const enhancedSaveCreds = async () => {
      await originalSaveCreds();
      // Auto-backup to cloud after creds update
      try {
        console.log('Auto-backup to cloud initiated...');
        if (this.configService.get<string>('server.node_env') !== 'production') {
          console.log('Auto-backup skipped in development mode');
          return;
        }
        await this.autoBackupToCloud();
      } catch (error) {
        console.error('Auto-backup failed:', error);
      }
    };

    this.socket.ev.on('creds.update', enhancedSaveCreds);
    
    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.table({ update, nowBA: nowBA().toISO() });
      
      if (qr) {
        console.log('QR Code received, updating app service...');
        this.appService.setQrCode(qr);
        this.qrAttempts++;
        this.connectionState = 'connecting';
      }
      
      if (connection === 'close') {
        this.connectionState = 'disconnected';
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        
        // Solo reconectar si no hemos excedido los intentos de QR
        if (shouldReconnect && this.qrAttempts < this.maxQrAttempts) {
          console.log(`Reconectando... (intento ${this.qrAttempts}/${this.maxQrAttempts})`);
          // Usar setTimeout para evitar recursión directa
          setTimeout(() => this.reconnect(), 2000);
        } else if (this.qrAttempts >= this.maxQrAttempts) {
          console.log('Máximo de intentos de QR alcanzado. No se reconectará automáticamente.');
        }
      } else if (connection === 'open') {
        this.connectionState = 'connected';
        console.log('WhatsApp connection established!');
        this.qrAttempts = 0; // Reset contador cuando se conecta exitosamente
        // Backup session when successfully connected
        console.log('Backing up session to cloud...', this.configService.get<string>('server.node_env'));
        if(this.configService.get<string>('server.node_env') === 'production') {
          this.autoBackupToCloud().catch(console.error);
        } else {
          console.log('Auto-backup skipped in development mode');
        }
      }
    });

    // Solo marcar como inicializado si hay una sesión válida
    if (hasValidSession) {
      console.log('✅ Servicio inicializado con sesión válida');
      this.isInitialized = true;
    } else {
      console.log('⚠️ Servicio inicializado sin sesión válida - QR requerido');
      this.isInitialized = true; // Marcar como inicializado para evitar bucles
    }
  }

  /**
   * Método separado para reconexión (evita recursión directa)
   */
  private async reconnect(): Promise<void> {
    try {
      console.log('🔄 Iniciando reconexión...');
      this.isInitialized = false; // Reset para permitir nueva inicialización
      await this.onModuleInit();
    } catch (error) {
      console.error('❌ Error durante reconexión:', error);
    }
  }

  async sendMessageVep(
    jid: string,
    text: string,
    fileName: string,
    archive: Buffer,
    media?: string,
    isGroup?: boolean,
  ) {
    const jid_final = isGroup ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
    console.table({ jid_final, text, fileName, archive, media, isGroup });
    switch (media) {
      case 'document':
        await this.socket.sendMessage(jid_final, {
          document: archive,
          fileName: fileName ? fileName : 'nuevo_pdf.pdf',
          mimetype: 'application/pdf',
          caption: text,
        });
        break;
      case 'image':
        await this.socket.sendMessage(jid_final, {
          image: archive,
          caption: text,
        });
        break;
      case 'video':
        await this.socket.sendMessage(jid_final, {
          video: archive,
          caption: text,
        });
        break;
      case 'audio':
        await this.socket.sendMessage(jid_final, {
          audio: archive,
          mimetype: 'audio/mpeg',
        });
        break;
      default:
        await this.socket.sendMessage(jid_final, { text });
        break;
    }
  }

  // Nuevo método para múltiples archivos
  async sendMultipleFiles(
    jid: string,
    text: string,
    files: Array<{
      archive: Buffer;
      fileName: string;
      media: string;
      mimetype?: string;
    }>,
    isGroup?: boolean,
  ) {
    const jid_final = isGroup ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;

    // Enviar mensaje de texto primero si existe
    if (text) {
      await this.socket.sendMessage(jid_final, { text });
    }

    // Enviar archivos consecutivamente
    for (const file of files) {
      try {
        switch (file.media) {
          case 'document':
            await this.socket.sendMessage(jid_final, {
              document: file.archive,
              fileName: file.fileName || 'archivo.pdf',
              mimetype: file.mimetype || 'application/pdf',
            });
            break;
          case 'image':
            await this.socket.sendMessage(jid_final, {
              image: file.archive,
            });
            break;
          case 'video':
            await this.socket.sendMessage(jid_final, {
              video: file.archive,
              mimetype: file.mimetype || 'video/mp4',
            });
            break;
          case 'audio':
            await this.socket.sendMessage(jid_final, {
              audio: file.archive,
              mimetype: file.mimetype || 'audio/mp3',
            });
            break;
          default:
            console.warn(`Tipo de archivo no soportado: ${file.media}`);
            break;
        }

        // Pequeña pausa entre archivos para evitar spam
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error enviando archivo ${file.fileName}:`, error);
        // Continuar con el siguiente archivo
      }
    }
  }

  // Método para enviar múltiples documentos específicamente
  async sendMultipleDocuments(
    jid: string,
    text: string,
    documents: Array<{
      archive: Buffer;
      fileName: string;
      mimetype?: string;
    }>,
    isGroup?: boolean,
  ) {
    const files = documents.map(doc => ({
      ...doc,
      media: 'document' as const,
      mimetype: doc.mimetype || 'application/pdf'
    }));
    
    return this.sendMultipleFiles(jid, text, files, isGroup);
  }

  async uploadSession(sessionFiles: { [fileName: string]: string }): Promise<void> {
    try {
      // Crear un ZIP con todos los archivos de sesión
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      // Agregar cada archivo de sesión al ZIP
      for (const [fileName, fileContent] of Object.entries(sessionFiles)) {
        const buffer = Buffer.from(fileContent, 'base64');
        zip.addFile(fileName, buffer);
      }

      const zipBuffer = zip.toBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const zipFileName = `whatsapp-session-${timestamp}.zip`;

      // Subir el ZIP a DigitalOcean Spaces
      await this.digitalOceanService.uploadFile(zipFileName, zipBuffer);
      
      console.log(`Session uploaded successfully as ${zipFileName}`);
    } catch (error) {
      console.error('Error uploading session:', error);
      throw error;
    }
  }

  async deleteSession(): Promise<void> {
    try {
      const sessionDirPath = this.SESSION_DIR; // './session'
      
      // Usar fs.rm con recursive y force para manejar tanto archivos como directorios
      await fs.rm(sessionDirPath, { 
        recursive: true,  // Elimina directorios recursivamente
        force: true       // No falla si el archivo/directorio no existe
      });
      
      console.log(`Session ${this.SESSION_DIR} deleted successfully`);
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  async downloadSession(sessionFileName?: string): Promise<void> {
    try {
      // Si no se especifica un archivo, buscar el más reciente
      if (!sessionFileName) {
        // Aquí deberías implementar lógica para listar archivos y encontrar el más reciente
        sessionFileName = 'whatsapp-session-latest.zip';
      }

      const sessionZip = await this.digitalOceanService.getFile(sessionFileName);
      
      // Extraer ZIP localmente
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(sessionZip);
      
      // Crear directorio de sesión si no existe
      await fs.mkdir('./session', { recursive: true });
      
      // Extraer todos los archivos
      zip.extractAllTo('./session/', true);
      
      console.log('Session downloaded and extracted successfully');
    } catch (error) {
      console.error('Error downloading session:', error);
      throw error;
    }
  }

  async backupCurrentSession(): Promise<string> {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      
      // Leer todos los archivos de la carpeta session
      const sessionDir = './session';
      const files = await fs.readdir(sessionDir);
      
      for (const file of files) {
        const filePath = path.join(sessionDir, file);
        const fileStats = await fs.stat(filePath);
        
        if (fileStats.isFile()) {
          const fileContent = await fs.readFile(filePath);
          zip.addFile(file, fileContent);
        }
      }

      const zipBuffer = zip.toBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const zipFileName = `whatsapp-session-backup-${timestamp}.zip`;

      await this.digitalOceanService.uploadFile(zipFileName, zipBuffer);
      
      console.log(`Session backed up successfully as ${zipFileName}`);
      return zipFileName;
    } catch (error) {
      console.error('Error backing up session:', error);
      throw error;
    }
  }

  private async downloadLatestSession(): Promise<void> {
    try {
      // Intentar descargar la sesión más reciente
      await this.downloadSession();
    } catch (error) {
      console.log('No existing session found in cloud, starting fresh');
      throw error;
    }
  }

  private async autoBackupToCloud(): Promise<void> {
    try {
      console.log('Starting auto-backup to cloud...');
      
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      
      const sessionDir = './session';
      
      // Leer todos los archivos de la carpeta session
      try {
        const files = await fs.readdir(sessionDir);
        console.log(`Found ${files.length} files in session directory`);
        
        for (const file of files) {
          const filePath = path.join(sessionDir, file);
          try {
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
              const fileContent = await fs.readFile(filePath);
              zip.addFile(file, fileContent);
              console.log(`Added ${file} to backup`);
            }
          } catch (error) {
            console.warn(`Could not add ${file} to backup:`, error.message);
          }
        }
      } catch (error) {
        console.warn('Could not read session directory:', error.message);
        // Fallback: solo creds.json si no se puede leer el directorio
        const essentialFiles = ['creds.json'];
        for (const file of essentialFiles) {
          const filePath = path.join(sessionDir, file);
          try {
            const fileContent = await fs.readFile(filePath);
            zip.addFile(file, fileContent);
            console.log(`Added ${file} to backup (fallback)`);
          } catch (error) {
            console.warn(`Could not add ${file} to backup:`, error.message);
          }
        }
      }

      const zipBuffer = zip.toBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `session-backup-${timestamp}.zip`;
      
      await this.digitalOceanService.uploadFile(
        `session-backups/${fileName}`,
        zipBuffer
      );
      
      console.log('Auto-backup to cloud completed successfully');
    } catch (error) {
      console.error('Auto-backup to cloud failed:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  /**
   * Verifica si WhatsApp está conectado
   */
  isConnected(): boolean {
    return this.connectionState === 'connected' && this.socket && this.socket.user !== null;
  }

  /**
   * Obtiene el estado de la conexión
   */
  getConnectionStatus(): { connected: boolean; user?: any } {
    return {
      connected: this.isConnected(),
      user: this.socket?.user || null
    };
  }

  /**
   * Genera QR bajo demanda (siempre genera QR nuevo, sin importar sesión local)
   */

  async generateQrOnDemand(force: boolean = false): Promise<string> {

    // Si ya está conectado, devolver QR con "hola"
    if (this.isConnected()) {
      return 'hola';
    }


    // Si ya hemos excedido los intentos y no es forzado, no generar más QR
    if (!force && this.qrAttempts >= this.maxQrAttempts) {
      throw new Error('Máximo de intentos de QR alcanzado');
    }

    console.log(`🔄 Generando QR bajo demanda ${force ? '(FORZADO)' : ''}(ignorando sesión local existente)...`);


    // Reiniciar conexión para generar nuevo QR
    if (this.socket) {
      await this.socket.logout();
    }

    // Crear nueva conexión
    const { state, saveCreds } = await useMultiFileAuthState(this.SESSION_DIR);
    
    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      markOnlineOnConnect: true,
      browser: ['VEP Sender', 'Chrome', '4.0.0'],
    });

    // Configurar eventos
    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('QR Code generated on demand');
        this.appService.setQrCode(qr);
        this.qrAttempts++;
      }
      
      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        
        if (shouldReconnect && this.qrAttempts < this.maxQrAttempts) {
          console.log(`Reconectando... (intento ${this.qrAttempts}/${this.maxQrAttempts})`);
        }
      } else if (connection === 'open') {
        console.log('WhatsApp connection opened');
        this.qrAttempts = 0;
      }
    });

    // Esperar un poco para que se genere el QR
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Devolver el QR generado
    return this.appService.getQrCode() || 'Generando QR...';
  }

  /**
   * Obtiene el QR actual o genera uno nuevo
   */
  async getQrCode(forceNew: boolean = false): Promise<string> {
    // Si ya está conectado, devolver "hola"
    if (this.isConnected()) {
      return 'hola';
    }

    // Si se fuerza nuevo QR, saltar verificación de sesión local
    if (forceNew) {
      console.log('🔄 Forzando generación de nuevo QR...');

      return await this.generateQrOnDemand(true); // Pasar force=true

    }

    // Verificar si hay una sesión válida local
    try {
      const { state } = await useMultiFileAuthState(this.SESSION_DIR);
      if (state.creds && state.creds.me) {
        console.log('✅ Sesión local válida encontrada, no se necesita QR');
        return 'hola';
      }
    } catch (error) {
      console.log('❌ No hay sesión local válida');
    }

    // Si hay un QR pendiente, devolverlo
    const currentQr = this.appService.getQrCode();
    if (currentQr) {
      return currentQr;
    }

    // Generar nuevo QR bajo demanda
    return await this.generateQrOnDemand();
  }
}
