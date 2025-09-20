import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QrCodeDto {
  @ApiProperty({
    description: 'Datos para generar el código QR',
    example: 'https://wa.me/5491136585581',
  })
  @IsString()
  @IsNotEmpty()
  data: string;

  @ApiPropertyOptional({
    description: 'Tamaño del código QR en píxeles',
    example: 200,
    default: 200,
  })
  @IsString()
  @IsOptional()
  size?: string;
}
