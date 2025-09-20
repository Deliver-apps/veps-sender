import { IsString, IsBoolean, IsOptional, IsNotEmpty, IsPhoneNumber, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JoinedUserDto {
  @ApiProperty({
    description: 'Nombre del usuario asociado',
    example: 'Carlos Saldaña',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'CUIT del usuario asociado',
    example: '20-38694960-4',
    pattern: '^[0-9]{2}-[0-9]{8}-[0-9]{1}$',
  })
  @IsString()
  @IsNotEmpty()
  cuit: string;
}

export class CreateVepUserDto {
  @ApiProperty({
    description: 'Nombre alternativo del usuario',
    example: 'Juanitoo',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  alter_name: string;

  @ApiPropertyOptional({
    description: 'CUIT del usuario',
    example: '20-38694960-4',
    pattern: '^[0-9]{2}-[0-9]{8}-[0-9]{1}$',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  cuit?: string | null;

  @ApiPropertyOptional({
    description: 'Fecha de ejecución',
    example: '2024-01-15T10:30:00Z',
    format: 'date-time',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  execution_date?: string | null;

  @ApiPropertyOptional({
    description: 'Indica si es un grupo de usuarios',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_group?: boolean;

  @ApiPropertyOptional({
    description: 'Última ejecución del usuario',
    example: '2024-01-15T10:30:00Z',
    format: 'date-time',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  last_execution?: string | null;

  @ApiProperty({
    description: 'Número de teléfono móvil',
    example: '+5491136585581',
    pattern: '^\\+549[0-9]{10}$',
  })
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('AR')
  mobile_number: string;

  @ApiPropertyOptional({
    description: 'Indica si necesita papeles',
    example: true,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_papers?: boolean | null;

  @ApiPropertyOptional({
    description: 'Indica si necesita Z',
    example: false,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_z?: boolean | null;

  @ApiPropertyOptional({
    description: 'Indica si necesita compra',
    example: true,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_compra?: boolean | null;

  @ApiPropertyOptional({
    description: 'Indica si necesita auditoría',
    example: false,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_auditoria?: boolean | null;

  @ApiProperty({
    description: 'Nombre real del usuario',
    example: 'Juan Pérez',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  real_name: string;

  @ApiProperty({
    description: 'Tipo de usuario',
    example: 'autónomo',
    enum: ['autónomo', 'credencial', 'monotributo'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['autónomo', 'credencial', 'monotributo'])
  type: 'autónomo' | 'credencial' | 'monotributo';

  @ApiPropertyOptional({
    description: 'Array de usuarios asociados',
    type: [JoinedUserDto],
    example: [
      {
        name: 'Carlos Saldaña',
        cuit: '20-38694960-4'
      }
    ],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JoinedUserDto)
  joined_users?: JoinedUserDto[];

  @ApiPropertyOptional({
    description: 'Usuario asociado (campo obsoleto, usar joined_users)',
    example: 'Carlos Saldaña',
    deprecated: true,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  joined_with?: string | null;

  @ApiPropertyOptional({
    description: 'CUIT del usuario asociado (campo obsoleto, usar joined_users)',
    example: '20-38694960-4',
    deprecated: true,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  joined_cuit?: string | null;
}
