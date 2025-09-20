import { PartialType } from '@nestjs/mapped-types';
import { CreateJobTimeDto } from './create-job-time.dto';

export class UpdateJobTimeDto extends PartialType(CreateJobTimeDto) {
  // Los campos son opcionales gracias a PartialType
}
