import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadSessionDto {
  @ApiProperty({
    description: 'Ruta del archivo de sesión a subir',
    example: './session',
  })
  @IsString()
  @IsNotEmpty()
  sessionPath: string;

  @ApiPropertyOptional({
    description: 'Nombre del archivo en Digital Ocean Spaces',
    example: 'session-backup-2024-01-15.json',
  })
  @IsString()
  @IsOptional()
  fileName?: string;
}
