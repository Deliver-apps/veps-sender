import { IsString, IsBoolean, IsOptional, IsNotEmpty, IsPhoneNumber, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class JoinedUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  cuit: string;
}

export class CreateVepUserDto {
  @IsString()
  @IsNotEmpty()
  alter_name: string;

  @IsString()
  @IsOptional()
  cuit?: string | null;

  @IsString()
  @IsOptional()
  execution_date?: string | null;

  @IsBoolean()
  @IsOptional()
  is_group?: boolean;

  @IsString()
  @IsOptional()
  last_execution?: string | null;

  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('AR')
  mobile_number: string;

  @IsBoolean()
  @IsOptional()
  need_papers?: boolean | null;

  @IsBoolean()
  @IsOptional()
  need_z?: boolean | null;

  @IsBoolean()
  @IsOptional()
  need_compra?: boolean | null;

  @IsBoolean()
  @IsOptional()
  need_auditoria?: boolean | null;

  @IsString()
  @IsNotEmpty()
  real_name: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['autónomo', 'credencial'])
  type: 'autónomo' | 'credencial';

  // Nuevos campos para múltiples usuarios asociados (arrays JSON)
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JoinedUserDto)
  joined_users?: JoinedUserDto[];

  // Mantener compatibilidad con campos antiguos (opcional)
  @IsString()
  @IsOptional()
  joined_with?: string | null;

  @IsString()
  @IsOptional()
  joined_cuit?: string | null;
}
