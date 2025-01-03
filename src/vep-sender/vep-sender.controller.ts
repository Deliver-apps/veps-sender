import { Controller, Logger } from '@nestjs/common';

@Controller('vep-sender')
export class VepSenderController {
  private readonly logger = new Logger('Vep-Sender-Controller');

  constructor() {}
}
