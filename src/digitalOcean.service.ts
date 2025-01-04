import {
  GetObjectCommand,
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandOutput,
  S3,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

@Injectable()
export class DigitalOceanService {
  private s3: S3;

  constructor(private configService: ConfigService) {
    const do_access_key = this.configService.get<string>(
      'digitalOcean.do_access_key',
    );
    const do_secret_key = this.configService.get<string>(
      'digitalOcean.do_secret_key',
    );
    const do_spaces_endpoint = this.configService.get<string>(
      'digitalOcean.do_spaces_endpoint',
    );
    const do_region = this.configService.get<string>('digitalOcean.do_region');

    this.s3 = new S3({
      credentials: {
        accessKeyId: do_access_key,
        secretAccessKey: do_secret_key,
      },
      endpoint: do_spaces_endpoint,
      region: do_region,
    });
  }

  async getFile(fileName: string): Promise<Buffer> {
    try {
      // 1. Send the command
      const { Body } = await this.s3.send(
        new GetObjectCommand({
          Bucket: 'veps-facturacion',
          Key: fileName,
        }),
      );

      // 2. The Body is often a Readable stream
      const stream = Body as Readable;

      // 3. Read all chunks into an array
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }

      // 4. Concatenate to get a single Buffer
      return Buffer.concat(chunks);
    } catch (e) {
      console.error(e);
      throw new Error('Error getting file from DigitalOcean');
    }
  }

  async uploadFile(
    fileName: string,
    fileContent: Buffer,
  ): Promise<PutObjectCommandOutput> {
    try {
      const params = {
        Bucket: 'veps-facturacion',
        Key: fileName,
        Body: fileContent,
        ACL: ObjectCannedACL.public_read,
      };
      const uploaded = await this.s3.send(new PutObjectCommand(params));
      return uploaded;
    } catch (e) {
      console.error(e);
      throw new Error('Error uploading file to DigitalOcean');
    }
  }
}
