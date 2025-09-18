import {
  GetObjectCommand,
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandOutput,
  S3,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

export interface FolderItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: Date;
  key: string;
}

export interface FolderContents {
  items: FolderItem[];
  totalCount: number;
  folderPath: string;
}

@Injectable()
export class DigitalOceanService {
  private s3: S3;
  private readonly bucketName = 'veps-facturacion';

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
          Bucket: this.bucketName,
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

  async getFileVeps(fileName: string, folderName: string): Promise<Buffer> {
    try {
      // 1. Send the command
      const { Body } = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: `${folderName}/${fileName}`,
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
        Bucket: this.bucketName,
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

  /**
   * Crea una carpeta en Digital Ocean Spaces
   * @param folderName Nombre de la carpeta (ej: veps_agosto_2025)
   */
  async createFolder(folderName: string): Promise<{ success: boolean; message: string; folderName: string }> {
    try {
      // Verificar si la carpeta ya existe
      const exists = await this.folderExists(folderName);
      if (exists) {
        throw new ConflictException(`La carpeta '${folderName}' ya existe`);
      }

      // En S3/Spaces, las carpetas se crean subiendo un objeto vacío con '/' al final
      const params = {
        Bucket: this.bucketName,
        Key: `${folderName}/`,
        Body: Buffer.from(''),
        ACL: ObjectCannedACL.public_read,
      };

      await this.s3.send(new PutObjectCommand(params));
      
      return {
        success: true,
        message: `Carpeta '${folderName}' creada exitosamente`,
        folderName
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      console.error('Error creating folder:', error);
      throw new Error(`Error al crear la carpeta '${folderName}': ${error.message}`);
    }
  }

  /**
   * Verifica si una carpeta existe
   * @param folderName Nombre de la carpeta
   */
  async folderExists(folderName: string): Promise<boolean> {
    try {
      // Intentar obtener el objeto de la carpeta
      await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: `${folderName}/`
      }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // Si hay otro tipo de error, lo relanzamos
      throw error;
    }
  }

  /**
   * Lista todas las carpetas del bucket
   */
  async listFolders(): Promise<string[]> {
    try {
      const params = {
        Bucket: this.bucketName,
        Delimiter: '/',
      };

      const response: ListObjectsV2CommandOutput = await this.s3.send(new ListObjectsV2Command(params));
      
      const folders: string[] = [];
      
      // Los prefijos comunes representan las carpetas
      if (response.CommonPrefixes) {
        folders.push(...response.CommonPrefixes.map(prefix => prefix.Prefix.replace('/', '')));
      }

      return folders;
    } catch (error) {
      console.error('Error listing folders:', error);
      throw new Error(`Error al listar las carpetas: ${error.message}`);
    }
  }

  /**
   * Busca carpetas por nombre parcial
   * @param searchTerm Término de búsqueda
   */
  async searchFolders(searchTerm: string): Promise<string[]> {
    try {
      const allFolders = await this.listFolders();
      return allFolders.filter(folder => 
        folder.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching folders:', error);
      throw new Error(`Error al buscar carpetas: ${error.message}`);
    }
  }

  /**
   * Lista todo el contenido de una carpeta
   * @param folderName Nombre de la carpeta
   */
  async getFolderContents(folderName: string): Promise<FolderContents> {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: `${folderName}/`,
        Delimiter: '/',
      };

      const response: ListObjectsV2CommandOutput = await this.s3.send(new ListObjectsV2Command(params));
      
      const items: FolderItem[] = [];

      // Agregar subcarpetas
      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          const subFolderName = prefix.Prefix.replace(`${folderName}/`, '').replace('/', '');
          if (subFolderName) { // Evitar nombres vacíos
            items.push({
              name: subFolderName,
              type: 'folder',
              key: prefix.Prefix,
            });
          }
        }
      }

      // Agregar archivos
      if (response.Contents) {
        for (const object of response.Contents) {
          const fileName = object.Key.replace(`${folderName}/`, '');
          // Evitar el objeto de la carpeta misma y nombres vacíos
          if (fileName && fileName !== '') {
            items.push({
              name: fileName,
              type: 'file',
              size: object.Size,
              lastModified: object.LastModified,
              key: object.Key,
            });
          }
        }
      }

      return {
        items,
        totalCount: items.length,
        folderPath: folderName,
      };
    } catch (error) {
      console.error('Error getting folder contents:', error);
      throw new Error(`Error al obtener el contenido de la carpeta '${folderName}': ${error.message}`);
    }
  }

  /**
   * Busca archivos por nombre parcial en todo el bucket o en una carpeta específica
   * @param searchTerm Término de búsqueda
   * @param folderName Carpeta específica (opcional)
   */
  async searchFiles(searchTerm: string, folderName?: string): Promise<FolderItem[]> {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: folderName ? `${folderName}/` : '',
      };

      const response: ListObjectsV2CommandOutput = await this.s3.send(new ListObjectsV2Command(params));
      
      const matchingFiles: FolderItem[] = [];

      if (response.Contents) {
        for (const object of response.Contents) {
          const fileName = folderName 
            ? object.Key.replace(`${folderName}/`, '')
            : object.Key;
          
          // Buscar en el nombre del archivo
          if (fileName.toLowerCase().includes(searchTerm.toLowerCase()) && fileName !== '') {
            matchingFiles.push({
              name: fileName,
              type: 'file',
              size: object.Size,
              lastModified: object.LastModified,
              key: object.Key,
            });
          }
        }
      }

      return matchingFiles;
    } catch (error) {
      console.error('Error searching files:', error);
      throw new Error(`Error al buscar archivos: ${error.message}`);
    }
  }

  /**
   * Renombra un archivo
   * @param oldKey Clave actual del archivo
   * @param newKey Nueva clave del archivo
   */
  async renameFile(oldKey: string, newKey: string): Promise<{ success: boolean; message: string; oldKey: string; newKey: string }> {
    try {
      // Verificar que el archivo origen existe
      try {
        await this.s3.send(new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: oldKey
        }));
      } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
          throw new BadRequestException(`El archivo '${oldKey}' no existe`);
        }
        throw error;
      }

      // Verificar que el archivo destino no existe
      try {
        await this.s3.send(new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: newKey
        }));
        throw new ConflictException(`Ya existe un archivo con el nombre '${newKey}'`);
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }
        // Si no existe (404), continuamos
        if (error.name !== 'NotFound' && error.$metadata?.httpStatusCode !== 404) {
          throw error;
        }
      }

      // Copiar el archivo con el nuevo nombre
      await this.s3.send(new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${oldKey}`,
        Key: newKey,
        ACL: ObjectCannedACL.public_read,
      }));

      // Eliminar el archivo original
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: oldKey
      }));

      return {
        success: true,
        message: `Archivo renombrado exitosamente de '${oldKey}' a '${newKey}'`,
        oldKey,
        newKey
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      console.error('Error renaming file:', error);
      throw new Error(`Error al renombrar el archivo: ${error.message}`);
    }
  }

  /**
   * Descarga un archivo por su clave (key) completa
   * @param fileKey Clave completa del archivo (incluyendo carpeta)
   */
  async downloadFile(fileKey: string): Promise<Buffer> {
    try {
      const { Body } = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
        }),
      );

      const stream = Body as Readable;
      const chunks: Buffer[] = [];
      
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error downloading file:', error);
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw new BadRequestException(`El archivo '${fileKey}' no existe`);
      }
      throw new Error(`Error al descargar el archivo '${fileKey}': ${error.message}`);
    }
  }

  /**
   * Busca un archivo por nombre exacto y devuelve su información
   * @param fileName Nombre del archivo a buscar
   * @param folderName Carpeta específica (opcional)
   */
  async findFileByName(fileName: string, folderName?: string): Promise<FolderItem | null> {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: folderName ? `${folderName}/` : '',
      };

      const response: ListObjectsV2CommandOutput = await this.s3.send(new ListObjectsV2Command(params));
      
      if (response.Contents) {
        for (const object of response.Contents) {
          const objectFileName = folderName 
            ? object.Key.replace(`${folderName}/`, '')
            : object.Key;
          
          // Buscar coincidencia exacta del nombre
          if (objectFileName === fileName && fileName !== '') {
            return {
              name: objectFileName,
              type: 'file',
              size: object.Size,
              lastModified: object.LastModified,
              key: object.Key,
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding file by name:', error);
      throw new Error(`Error al buscar el archivo '${fileName}': ${error.message}`);
    }
  }

  /**
   * Genera el nombre de carpeta con formato veps_(mes en español)_(año)
   * @param month Número del mes (1-12)
   * @param year Año
   */
  static generateFolderName(month: number, year: number): string {
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    if (month < 1 || month > 12) {
      throw new BadRequestException('El mes debe estar entre 1 y 12');
    }
    
    return `veps_${months[month - 1]}_${year}`;
  }
}
