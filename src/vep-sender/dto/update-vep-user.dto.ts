import { PartialType } from '@nestjs/mapped-types';
import { CreateVepUserDto } from './create-vep-user.dto';

export class UpdateVepUserDto extends PartialType(CreateVepUserDto) {}
