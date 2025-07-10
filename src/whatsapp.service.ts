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

@Injectable()
export class WhatsappService implements OnModuleInit {
  private socket: ReturnType<typeof makeWASocket>;
  private sessionData: any;
  private SESSION_FILE: string = './session.json';

  constructor(
    private appService: AppService,
    private digitalOceanService: DigitalOceanService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Intentar descargar sesión de la nube primero
    try {
      await this.downloadLatestSession();
    } catch (error) {
      console.log('No existing session found in cloud or download failed, starting fresh');
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.SESSION_FILE);

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
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
      console.table(update)
      if (qr) {
        console.log('QR Code received, updating app service...');
        this.appService.setQrCode(qr);
      }
      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        if (shouldReconnect) {
          this.onModuleInit();
        }
      } else if (connection === 'open') {
        this.socket.ev.on("creds.update", enhancedSaveCreds);
        console.log('WhatsApp connection established!');
        // Backup session when successfully connected
        console.log('Backing up session to cloud...', this.configService.get<string>('server.node_env'));
        if(this.configService.get<string>('server.node_env') === 'production') {
          this.autoBackupToCloud().catch(console.error);
        } else {
          console.log('Auto-backup skipped in development mode');
        }
      }
    });
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
        await this.socket.sendMessage(jid_final, { text });
        break;
      case 'audio':
        await this.socket.sendMessage(jid_final, { text });
        break;
      default:
        await this.socket.sendMessage(jid_final, { text });
        break;
    }
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
      await fs.mkdir('./session.json', { recursive: true });
      
      // Extraer todos los archivos
      zip.extractAllTo('./session.json/', true);
      
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
      
      // Leer todos los archivos de la carpeta session.json
      const sessionDir = './session.json';
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
      // Crear un backup ligero solo con archivos esenciales
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      
      const sessionDir = './session.json';
      const essentialFiles = ['creds.json']; // Solo archivos críticos para auto-backup
      
      for (const file of essentialFiles) {
        const filePath = path.join(sessionDir, file);
        try {
          const fileContent = await fs.readFile(filePath);
          zip.addFile(file, fileContent);
        } catch (error) {
          console.log(`File ${file} not found for auto-backup, skipping`);
        }
      }

      const zipBuffer = zip.toBuffer();
      await this.digitalOceanService.uploadFile('whatsapp-session-latest.zip', zipBuffer);
      
      console.log('Auto-backup to cloud completed');
    } catch (error) {
      console.error('Auto-backup to cloud failed:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }
}
