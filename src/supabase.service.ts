import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Database } from './supabase.types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient<Database>;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    const supabaseKey = this.configService.get<string>('supabase.key');

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async getVepUsers(): Promise<
    Database['public']['Tables']['vep_users']['Row'][]
  > {
    const { data, error } = await this.supabase.from('vep_users').select('*');
    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
    return data;
  }

  async updateVepUserLastExecution(
    userId: number,
    lastExecution: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('vep_users')
      .update({ last_execution: lastExecution })
      .eq('id', userId);

    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
  }

  async getThisMonthNotSentUsers(): Promise<
    Database['public']['Tables']['vep_users']['Row'][]
  > {
    const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11
    const { data, error } = await this.supabase
      .from('vep_users')
      .select('*')
      .eq('last_execution', null)
      .or(`last_execution.is.null,last_execution.eq.${currentMonth}`);
    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
    return data;
  }

  async verifyToken(token: string): Promise<{
    user: User;
  }> {
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }

    if (data.user === null) {
      throw new BadRequestException('Token no valido');
    }

    return data;
  }
}
