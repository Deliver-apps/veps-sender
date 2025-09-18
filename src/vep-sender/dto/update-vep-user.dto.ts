import { PartialType } from '@nestjs/mapped-types';
import { CreateVepUserDto, JoinedUserDto } from './create-vep-user.dto';

export class UpdateVepUserDto extends PartialType(CreateVepUserDto) {
  // Los campos joined_users también son opcionales en las actualizaciones
  // gracias a PartialType, pero podemos ser más específicos si es necesario
}
