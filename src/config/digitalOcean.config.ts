import { registerAs } from '@nestjs/config';

export default registerAs('digitalOcean', () => ({
  do_url: process.env.DO_BASE_URL,
  do_access_key: process.env.DO_ACCESS_KEY,
  do_secret_key: process.env.DO_SECRET_KEY,
  do_spaces_endpoint: process.env.DO_SPACES_ENDPOINT,
  do_region: process.env.DO_REGION,
}));
