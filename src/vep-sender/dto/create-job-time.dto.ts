import { IsString, IsOptional, IsArray, ValidateNested, IsIn, IsDateString, IsBoolean, IsNumber, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobTimeJoinedUserDto {
  @ApiProperty({
    description: 'CUIT del usuario asociado',
    example: '20-38694960-4',
  })
  @IsString()
  cuit: string;

  @ApiProperty({
    description: 'Nombre del usuario asociado',
    example: 'CARLOS SALDAÑA',
  })
  @IsString()
  name: string;
}

export class JobTimeUserDto {
  @ApiProperty({
    description: 'ID del usuario VEP',
    example: 109,
  })
  @IsNumber()
  id: number;

  @ApiProperty({
    description: 'Nombre real del usuario',
    example: 'JUAN PEREZ',
  })
  @IsString()
  real_name: string;

  @ApiProperty({
    description: 'Nombre alternativo del usuario',
    example: 'Juanitoo',
  })
  @IsString()
  alter_name: string;

  @ApiProperty({
    description: 'Número de teléfono móvil',
    example: '+5491136585581',
  })
  @IsString()
  mobile_number: string;

  @ApiPropertyOptional({
    description: 'Última ejecución del usuario',
    example: null,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  last_execution: string | null;

  @ApiPropertyOptional({
    description: 'Fecha de ejecución',
    example: null,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  execution_date: string | null;

  @ApiPropertyOptional({
    description: 'Indica si necesita papeles',
    example: null,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_papers: boolean | null;

  @ApiProperty({
    description: 'Indica si es un grupo de usuarios',
    example: false,
  })
  @IsBoolean()
  is_group: boolean;

  @ApiPropertyOptional({
    description: 'Array de usuarios asociados',
    type: [JobTimeJoinedUserDto],
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
  @ValidateNested({ each: true })
  @Type(() => JobTimeJoinedUserDto)
  joined_users: Array<{
    cuit: string;
    name: string;
  }> | null;

  @ApiPropertyOptional({
    description: 'Indica si necesita Z',
    example: null,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_z: boolean | null;

  @ApiPropertyOptional({
    description: 'Indica si necesita compra',
    example: null,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_compra: boolean | null;

  @ApiPropertyOptional({
    description: 'Indica si necesita auditoría',
    example: null,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  need_auditoria: boolean | null;

  @ApiPropertyOptional({
    description: 'CUIT del usuario',
    example: '20-38694960-4',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  cuit: string | null;

  @ApiProperty({
    description: 'Tipo de usuario',
    example: 'autónomo',
    enum: ['autónomo', 'credencial', 'monotributo'],
  })
  @IsString()
  @IsIn(['autónomo', 'credencial', 'monotributo'])
  type: 'autónomo' | 'credencial' | 'monotributo';

  @ApiProperty({
    description: 'Indica si el mensaje fue enviado exitosamente',
    example: false,
  })
  @IsBoolean()
  sent: boolean;
}

export class CreateJobTimeDto {
  @ApiPropertyOptional({
    description: 'Array de usuarios VEP incluidos en el job',
    type: [JobTimeUserDto],
    example: [
      {
        id: 109,
        real_name: 'JUAN PEREZ',
        alter_name: 'Juanitoo',
        mobile_number: '+5491136585581',
        last_execution: null,
        execution_date: null,
        need_papers: null,
        is_group: false,
        joined_users: [
          {
            cuit: '20-38694960-4',
            name: 'CARLOS SALDAÑA'
          }
        ],
        need_z: null,
        need_compra: null,
        need_auditoria: null,
        cuit: '20-38694960-4',
        type: 'autónomo',
        sent: false
      }
    ],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JobTimeUserDto)
  users?: JobTimeUserDto[];

  @ApiPropertyOptional({
    description: 'Tiempo de ejecución del job',
    example: '2025-09-18T23:13:45.953-03:00',
    format: 'date-time',
  })
  @IsDateString()
  @IsOptional()
  execution_time?: string;

  @ApiPropertyOptional({
    description: 'Tipo de usuarios en el job',
    example: 'autónomo',
    enum: ['autónomo', 'credencial', 'monotributo'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['autónomo', 'credencial', 'monotributo'])
  type?: 'autónomo' | 'credencial' | 'monotributo';

  @ApiPropertyOptional({
    description: 'Nombre de la carpeta donde se almacenarán los archivos',
    example: 'veps_septiembre_2025',
  })
  @IsString()
  @IsOptional()
  folder_name?: string;

  @ApiPropertyOptional({
    description: 'Estado del job',
    example: 'PENDING',
    enum: ['PENDING', 'FINISHED'],
    default: 'PENDING',
  })
  @IsString()
  @IsOptional()
  @IsIn(['PENDING', 'FINISHED'])
  status?: 'PENDING' | 'FINISHED';

  @ApiPropertyOptional({
    description: 'Fecha de caducidad del job en formato DD/MM',
    example: '31/12',
    pattern: 'DD/MM',
  })
  @IsString()
  @Matches(/^\d{2}\/\d{2}$/, {
    message: 'caducate must be in DD/MM format (e.g., 31/12)'
  })
  @IsOptional()
  caducate?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de ejecución del job',
    example: '2025-09-18T23:13:45.953Z',
    format: 'date-time',
  })
  @IsDateString()
  @IsOptional()
  executed_at?: string;
}
