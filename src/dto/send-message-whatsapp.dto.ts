import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageWhatsappDto {
  @ApiProperty({
    description: 'JID del destinatario (número de WhatsApp)',
    example: '5491136585581@s.whatsapp.net',
  })
  @IsString()
  @IsNotEmpty()
  jid: string;

  @ApiProperty({
    description: 'Mensaje de texto a enviar',
    example: 'Hola, aquí tienes tu archivo VEP',
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({
    description: 'Nombre del archivo',
    example: 'vep_documento.pdf',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    description: 'Archivo en formato base64',
    example: 'JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDIgMCBSCj4+Cj4+Ci9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9Db250ZW50cyA0IDAgUgo+PgplbmRvYmoKNC...',
  })
  @IsString()
  @IsNotEmpty()
  archive: string;

  @ApiPropertyOptional({
    description: 'Tipo de media (opcional)',
    example: 'application/pdf',
  })
  @IsString()
  @IsOptional()
  media?: string;

  @ApiPropertyOptional({
    description: 'Indica si es un grupo',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isGroup?: boolean;
}
