import { registerAs } from '@nestjs/config';

export default registerAs('server', () => ({
  port: process.env.PORT,
  node_env: process.env.NODE_ENV,
  vault_address: process.env.VAULT_ADDRESS,
  vault_token: process.env.VAULT_TOKEN,
  secret_key_login: process.env.SECRET_KEY_LOGIN,
  cront_time: process.env.CRONT_TIME,
}));
