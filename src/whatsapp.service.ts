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
  private maxQrAttempts: number = 2;
  private lastBackupTime: number = 0;
  private backupIntervalHours: number = 4;
  private isInitializing: boolean = false;

  constructor(
    private appService: AppService,
    private digitalOceanService: DigitalOceanService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Evitar múltiples inicializaciones concurrentes
    if (this.isInitializing) {
      console.log('⚠️ Ya hay una inicialización en progreso, omitiendo...');
      return;
    }
    
    this.isInitializing = true;
    
    try {
      console.log('🚀 Inicializando WhatsApp Service...');
      console.log('🔧 Environment:', {
        nodeEnv: process.env.NODE_ENV,
        isProduction: this.configService.get<string>('server.node_env') === 'production',
        sessionDir: this.SESSION_DIR
      });
      
      // Verificar si ya existe una sesión local válida
    let hasValidLocalSession = false;
    try {
      await fs.access(this.SESSION_DIR);
      const files = await fs.readdir(this.SESSION_DIR);
      
      // Verificar que existan archivos de sesión válidos
      const hasCredsFile = files.includes('creds.json');
      const hasSessionFiles = files.some(file => file.startsWith('session-'));
      
        if (hasCredsFile && hasSessionFiles) {
          console.log('✅ Sesión local válida encontrada, no se descargará de la nube');
          hasValidLocalSession = true;
          
          // Verificar que creds.json no esté vacío o corrupto
          try {
            const credsPath = path.join(this.SESSION_DIR, 'creds.json');
            const credsContent = await fs.readFile(credsPath, 'utf8');
            const creds = JSON.parse(credsContent);
            
            if (!creds.noiseKey || !creds.signedIdentityKey) {
              console.log('⚠️ Archivo creds.json incompleto');
              hasValidLocalSession = false;
            } else {
              console.log('✅ Archivo creds.json válido con claves necesarias');
            }
          } catch (error) {
            console.log('⚠️ Error leyendo creds.json:', error.message);
            hasValidLocalSession = false;
          }
        } else {
          console.log('❌ Sesión local incompleta - creds.json:', hasCredsFile, 'session files:', hasSessionFiles);
        }
    } catch (error) {
      console.log('❌ No se encontró directorio de sesión local');
    }

    // Solo descargar si no hay sesión local válida
    if (!hasValidLocalSession) {
      try {
        console.log('📥 Intentando descargar sesión de la nube...');
        await this.downloadLatestSession();
        console.log('✅ Sesión descargada exitosamente de la nube');
      } catch (error) {
        console.log('❌ No se encontró sesión en la nube o falló la descarga, iniciando sesión nueva');
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.SESSION_DIR);

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      // Configuraciones mejoradas para evitar timeouts
      // connectTimeoutMs: 60000, // 60 segundos para conexión
      // defaultQueryTimeoutMs: 30000, // 30 segundos para queries (reducido)
      // keepAliveIntervalMs: 30000, // Keep alive cada 30 segundos
      // retryRequestDelayMs: 1000, // 1 segundo entre reintentos
      // maxMsgRetryCount: 3, // Reducido a 3 reintentos
      // markOnlineOnConnect: true,
      // browser: ['VEP Sender', 'Chrome', '4.0.0'],
      // Configuraciones adicionales para estabilidad
      // generateHighQualityLinkPreview: false,
      // syncFullHistory: false,
      // // Configuraciones para reducir timeouts internos
      // getMessage: async (key) => {
      //   // Devolver undefined para evitar queries innecesarias
      //   return undefined;
      // },
    });
     
    // Enhance saveCreds to auto-backup to cloud
    const originalSaveCreds = saveCreds;
    const enhancedSaveCreds = async () => {
      try {
        // Asegurar que el directorio existe antes de guardar
        await fs.mkdir(this.SESSION_DIR, { recursive: true });
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
      } catch (saveError) {
        console.error('Error saving credentials:', saveError.message);
        // Intentar recrear el directorio si no existe
        try {
          await fs.mkdir(this.SESSION_DIR, { recursive: true });
          await originalSaveCreds();
        } catch (retryError) {
          console.error('Failed to save credentials after retry:', retryError.message);
        }
      }
    };

    this.socket.ev.on('creds.update', enhancedSaveCreds);
    
        this.socket.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          console.log('🔄 Connection update:', {
            connection,
            qr: !!qr,
            error: lastDisconnect?.error?.message,
            statusCode: (lastDisconnect?.error as any)?.output?.statusCode,
            timestamp: nowBA().toISO()
          });
      if (qr) {
        console.log('QR Code received, updating app service...');
        this.appService.setQrCode(qr);
        this.qrAttempts++;
        console.log(`QR generado (intento ${this.qrAttempts}/${this.maxQrAttempts})`);
      }
      if (connection === 'close') {
        const error = lastDisconnect?.error as Boom;
        const statusCode = error?.output?.statusCode;
        const errorMessage = error?.message || '';
        
        console.log(`🔍 Conexión cerrada - StatusCode: ${statusCode}, Message: ${errorMessage}`);
        
        // No reconectar en casos específicos que causan bucles infinitos
        const shouldNotReconnect = 
          statusCode === DisconnectReason.loggedOut ||
          errorMessage.includes('conflict') ||
          errorMessage.includes('replaced') ||
          statusCode === DisconnectReason.multideviceMismatch ||
          statusCode === DisconnectReason.forbidden;
        
        if (shouldNotReconnect) {
          console.log('🚫 No se reconectará automáticamente debido al tipo de error:', errorMessage);
          
          // Si es un conflicto, limpiar la sesión local para forzar nuevo QR
          if (errorMessage.includes('conflict') || errorMessage.includes('replaced')) {
            console.log('🧹 Limpiando sesión local debido a conflicto...');
            try {
              await this.deleteSession();
              // Recrear el directorio para evitar errores de escritura
              await fs.mkdir(this.SESSION_DIR, { recursive: true });
              console.log('✅ Sesión local limpiada. Usa /qr-code para generar nuevo QR');
            } catch (cleanError) {
              console.error('❌ Error limpiando sesión:', cleanError.message);
            }
          }
          
          console.log('💡 Solución: Escanea el QR nuevamente o verifica que no hay otra instancia activa');
          return;
        }
        
        // Reconectar solo si no hemos excedido los intentos y el error es recuperable
        if (this.qrAttempts < this.maxQrAttempts) {
          console.log(`🔄 Reconectando... (intento ${this.qrAttempts + 1}/${this.maxQrAttempts})`);
          // Esperar un poco antes de reconectar para evitar spam
          setTimeout(() => {
            this.onModuleInit();
          }, 5000); // 5 segundos de espera
        } else {
          console.log('❌ Máximo de intentos de QR alcanzado. No se reconectará automáticamente.');
          console.log('💡 Usa el endpoint /qr-code para generar un nuevo QR');
        }
      } else if (connection === 'open') {
        console.log('WhatsApp connection established!');
        this.qrAttempts = 0; // Reset contador al conectar exitosamente
        // Backup session when successfully connected
        console.log('Backing up session to cloud...', this.configService.get<string>('server.node_env'));
        if(this.configService.get<string>('server.node_env') === 'production') {
          this.autoBackupToCloud().catch(console.error);
        } else {
          console.log('Auto-backup skipped in development mode');
        }
      }
    });

    this.socket.ev.on('messages.upsert', async (m) => {
      console.log('Mensaje recibido:', JSON.stringify(m, undefined, 2));
    });
    
      // Marcar inicialización como completada
      this.isInitializing = false;
      console.log('✅ WhatsApp Service inicializado correctamente');
      
    } catch (error) {
      console.error('❌ Error durante la inicialización de WhatsApp Service:', error);
      this.isInitializing = false; // Reset flag en caso de error
      throw error;
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
    console.table({ jid_final, text, fileName, archive: archive?.length, media, isGroup });
    
    const maxRetries = 3;
    const timeoutMs = 45000; // 45 segundos para archivos (más tiempo que texto)
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Sending ${media || 'text'} message (attempt ${attempt}/${maxRetries}) to ${jid_final}`);
        
        let sendPromise: Promise<any>;
        
        switch (media) {
          case 'document':
            sendPromise = this.socket.sendMessage(jid_final, {
              document: archive,
              fileName: fileName ? fileName : 'nuevo_pdf.pdf',
              mimetype: 'application/pdf',
              caption: text,
            });
            break;
          case 'image':
            sendPromise = this.socket.sendMessage(jid_final, {
              image: archive,
              caption: text,
            });
            break;
          case 'video':
            sendPromise = this.socket.sendMessage(jid_final, {
              video: archive,
              caption: text,
            });
            break;
          case 'audio':
            sendPromise = this.socket.sendMessage(jid_final, {
              audio: archive,
              mimetype: 'audio/mpeg',
            });
            break;
          default:
            sendPromise = this.socket.sendMessage(jid_final, { text });
            break;
        }
        
        // Aplicar timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Message send timeout')), timeoutMs);
        });
        
        await Promise.race([sendPromise, timeoutPromise]);
        
        console.log(`✅ ${media || 'text'} message sent successfully to ${jid_final}`);
        return; // Éxito, salir del loop
        
      } catch (error) {
        console.error(`❌ Error sending ${media || 'text'} message (attempt ${attempt}/${maxRetries}):`, error.message);
        
        // Si es el último intento, lanzar el error
        if (attempt === maxRetries) {
          throw new Error(`Failed to send ${media || 'text'} message after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Esperar antes del siguiente intento (backoff exponencial)
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // Max 10 segundos para archivos
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
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
      const zipFileName = 'whatsapp-session-latest.zip';

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
      console.log('🔄 Descargando sesión desde DigitalOcean...');
      // Intentar descargar la sesión más reciente
      await this.downloadSession();
      console.log('✅ Sesión descargada y extraída exitosamente');
    } catch (error) {
      console.log('❌ No se encontró sesión en la nube o falló la descarga');
      throw error;
    }
  }

  /**
   * Verifica si es necesario hacer backup (cada 4 horas)
   */
  private shouldBackup(): boolean {
    const now = Date.now();
    const timeSinceLastBackup = now - this.lastBackupTime;
    const intervalMs = this.backupIntervalHours * 60 * 60 * 1000; // 4 horas en ms
    
    return timeSinceLastBackup >= intervalMs;
  }

  private async autoBackupToCloud(): Promise<void> {
    // Solo hacer backup si han pasado 4 horas
    if (!this.shouldBackup()) {
      const timeLeft = this.backupIntervalHours * 60 * 60 * 1000 - (Date.now() - this.lastBackupTime);
      const hoursLeft = Math.round(timeLeft / (60 * 60 * 1000));
      const minutesLeft = Math.round((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      console.log(`⏰ Backup programado en ${hoursLeft}h ${minutesLeft}m`);
      return;
    }

    try {
      console.log('🔄 Starting scheduled auto-backup to cloud...');
      
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
      
      // Guardar siempre como el mismo archivo en la raíz del bucket
      await this.digitalOceanService.uploadFile(
        'whatsapp-session-latest.zip',
        zipBuffer
      );
      
      // Actualizar timestamp del último backup
      this.lastBackupTime = Date.now();
      
      console.log('✅ Auto-backup to cloud completed successfully');
    } catch (error) {
      console.error('❌ Auto-backup to cloud failed:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  /**
   * Envía un mensaje de texto simple (para pruebas) con retry logic
   */
  async sendSimpleTextMessage(jid: string, text: string): Promise<void> {
    const maxRetries = 3;
    const timeoutMs = 30000; // 30 segundos
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verificar conexión antes de cada intento
        if (!this.isConnected()) {
          throw new Error('WhatsApp not connected');
        }
        
        console.log(`📤 Sending message (attempt ${attempt}/${maxRetries}) to ${jid}`);
        
        // Crear promise con timeout
        const sendPromise = this.socket.sendMessage(jid, { text });
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Message send timeout')), timeoutMs);
        });
        
        await Promise.race([sendPromise, timeoutPromise]);
        
        console.log(`✅ Test message sent successfully to ${jid}: ${text}`);
        return; // Éxito, salir del loop
        
      } catch (error) {
        console.error(`❌ Error sending test message (attempt ${attempt}/${maxRetries}):`, error.message);
        
        // Si es error de conexión cerrada, no reintentar
        if (error.message.includes('Connection Closed') || error.message.includes('WhatsApp not connected')) {
          console.error('🚫 Connection lost, cannot retry message sending');
          throw new Error(`Connection lost: ${error.message}`);
        }
        
        // Si es el último intento, lanzar el error
        if (attempt === maxRetries) {
          throw new Error(`Failed to send message after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Esperar antes del siguiente intento (backoff exponencial)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 segundos
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Verifica si WhatsApp está conectado
   */
  isConnected(): boolean {
    try {
      const connected = this.socket && 
                       this.socket.user !== null && 
                       this.socket.user !== undefined;
      
      console.log('🔍 isConnected detailed check:', {
        hasSocket: !!this.socket,
        hasUser: !!this.socket?.user,
        userId: this.socket?.user?.id,
        socketState: this.socket?.user ? 'authenticated' : 'not authenticated',
        wsReadyState: (this.socket?.ws as any)?.readyState,
        isInitializing: this.isInitializing,
        qrAttempts: this.qrAttempts,
        maxQrAttempts: this.maxQrAttempts,
        connected
      });
      
      return connected;
    } catch (error) {
      console.error('❌ Error checking connection:', error.message);
      return false;
    }
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
   * Obtiene la lista de grupos de WhatsApp
   */
  async getGroups(): Promise<Array<{ id: string; name: string; participantsCount: number }>> {
    try {
      if (!this.isConnected()) {
        throw new Error('WhatsApp not connected');
      }

      console.log('👥 Fetching WhatsApp groups...');
      
      // Obtener grupos usando Baileys
      const groups = await this.socket.groupFetchAllParticipating();
      
      // Formatear la respuesta
      const formattedGroups = Object.values(groups).map(group => ({
        id: group.id,
        name: group.subject || 'Sin nombre',
        participantsCount: group.participants ? group.participants.length : 0
      }));

      console.log(`✅ Found ${formattedGroups.length} groups`);
      return formattedGroups;
      
    } catch (error) {
      console.error('❌ Error getting groups:', error.message);
      throw new Error(`Failed to get groups: ${error.message}`);
    }
  }

  /**
   * Reinicializa WhatsApp manualmente (para debugging)
   */
  async forceReinitialization(): Promise<void> {
    console.log('🔄 Forzando reinicialización de WhatsApp...');
    
    try {
      // Resetear flags
      this.isInitializing = false;
      this.qrAttempts = 0;
      
      // Reinicializar
      await this.onModuleInit();
      
      console.log('✅ Reinicialización forzada completada');
    } catch (error) {
      console.error('❌ Error en reinicialización forzada:', error.message);
      throw error;
    }
  }

  /**
   * Genera QR on-demand (fuerza nueva generación)
   */
  async generateQrOnDemand(force: boolean = false): Promise<string> {
    console.log('generateQrOnDemand', this.isConnected());
    // Si ya está conectado, devolver "hola"
    // if (this.isConnected()) {
    //   return 'hola';
    // }

    // Si no es forzado y ya alcanzamos el máximo de intentos
    if (!force && this.qrAttempts >= this.maxQrAttempts) {
      throw new Error('Máximo de intentos de QR alcanzado');
    }

    console.log(`🔄 Generando QR on-demand ${force ? '(FORZADO)' : ''}...`);

    // Limpiar QR anterior
    this.appService.setQrCode('');

    // Si es forzado, resetear contador
    if (force) {
      this.qrAttempts = 0;
    }

    // Reinicializar conexión para generar nuevo QR
    await this.onModuleInit();

    // Esperar un poco para que se genere el QR
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const currentQr = this.appService.getQrCode();
        if (currentQr) {
          resolve(currentQr);
        } else {
          reject(new Error('Timeout generando QR'));
        }
      }, 5000);
    });
  }

  /**
   * Obtiene el QR actual o genera uno nuevo
   */
  async getQrCode(forceNew: boolean = false): Promise<string> {
    console.log('getQrCode', this.isConnected());
    // Si ya está conectado, devolver "hola"
    // if (this.isConnected()) {
    //   return 'hola';
    // }

    // Si se fuerza nuevo QR
    if (forceNew) {
      return await this.generateQrOnDemand(true);
    }

    // Si hay un QR actual, devolverlo
    const currentQr = this.appService.getQrCode();
    if (currentQr) {
      return currentQr;
    }

    // Si no hay QR y no hemos alcanzado el límite, generar uno
    if (this.qrAttempts < this.maxQrAttempts) {
      return await this.generateQrOnDemand();
    }

    // Si ya alcanzamos el límite, devolver mensaje
    return 'Máximo de intentos alcanzado. Use force=true para generar nuevo QR.';
  }
}
