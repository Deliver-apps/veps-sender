import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private qrCode: string = '';
  private alreadyLoggedIn: boolean = false;

  getHello(): string {
    return 'Hello World!';
  }

  setQrCode(qr: string): void {
    this.qrCode = qr;
  }

  getQrCode(): string {
    return this.qrCode;
  }

  setAlreadyLoggedIn(value: boolean): void {
    this.alreadyLoggedIn = value;
  }

  getAlreadyLoggedIn(): boolean {
    return this.alreadyLoggedIn;
  }
}
