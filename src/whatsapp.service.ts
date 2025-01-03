import { Injectable, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { AppService } from './app.service';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private socket: ReturnType<typeof makeWASocket>;
  private sessionData: any;
  private SESSION_FILE: string = './session.json';

  constructor(private appService: AppService) {}

  async onModuleInit() {
    const { state, saveCreds } = await useMultiFileAuthState(this.SESSION_FILE);

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });
    // Save auth state changes
    this.socket.ev.on('creds.update', saveCreds);
    // Handle connection updates
    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.appService.setQrCode(qr);
      }
      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        // Attempt to reconnect if not logged out
        if (shouldReconnect) {
          this.onModuleInit();
        }
      } else if (connection === 'open') {
        console.log('WhatsApp connection established!');
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
}
