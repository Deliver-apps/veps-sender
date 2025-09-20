import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageVepUserDto {
  @ApiProperty({
    description: 'ID del usuario VEP',
    example: 109,
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Nombre real del usuario',
    example: 'JUAN PEREZ',
  })
  @IsString()
  @IsNotEmpty()
  real_name: string;

  @ApiProperty({
    description: 'Nombre alternativo del usuario',
    example: 'Juanitoo',
  })
  @IsString()
  @IsNotEmpty()
  alter_name: string;

  @ApiProperty({
    description: 'Número de teléfono móvil',
    example: '+5491136585581',
  })
  @IsString()
  @IsNotEmpty()
  mobile_number: string;

  @ApiPropertyOptional({
    description: 'CUIT del usuario',
    example: '20-38694960-4',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  cuit?: string | null;

  @ApiProperty({
    description: 'Tipo de usuario',
    example: 'autónomo',
    enum: ['autónomo', 'credencial', 'monotributo'],
  })
  @IsString()
  @IsIn(['autónomo', 'credencial', 'monotributo'])
  type: 'autónomo' | 'credencial' | 'monotributo';

  @ApiPropertyOptional({
    description: 'Array de usuarios asociados',
    type: [Object],
    example: [
      {
        cuit: '20-38694960-4',
        name: 'CARLOS SALDAÑA'
      }
    ],
    nullable: true,
  })
  @IsArray()
  @IsOptional()
  joined_users?: Array<{
    cuit: string;
    name: string;
  }> | null;
}

export class SendMessageVepDto {
  @ApiProperty({
    description: 'Tiempo de ejecución del job',
    example: '2025-09-18T23:13:45.953-03:00',
    format: 'date-time',
  })
  @IsString()
  @IsNotEmpty()
  executionTime: string;

  @ApiProperty({
    description: 'Nombre de la carpeta donde se almacenarán los archivos',
    example: 'veps_septiembre_2025',
  })
  @IsString()
  @IsNotEmpty()
  folderName: string;

  @ApiProperty({
    description: 'Array de usuarios VEP incluidos en el job',
    type: [SendMessageVepUserDto],
    example: [
      {
        id: '109',
        real_name: 'JUAN PEREZ',
        alter_name: 'Juanitoo',
        mobile_number: '+5491136585581',
        cuit: '20-38694960-4',
        type: 'autónomo',
        joined_users: [
          {
            cuit: '20-38694960-4',
            name: 'CARLOS SALDAÑA'
          }
        ]
      }
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SendMessageVepUserDto)
  users: SendMessageVepUserDto[];
}
