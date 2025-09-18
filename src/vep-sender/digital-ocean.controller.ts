import { 
  Controller, 
  Logger, 
  Post, 
  Get, 
  Put,
  Query, 
  Param, 
  Body,
  BadRequestException,
  HttpStatus,
  HttpCode,
  Res,
  Header,
  UseGuards
} from '@nestjs/common';
import { Response } from 'express';
import { DigitalOceanService, FolderContents, FolderItem } from '../digitalOcean.service';
import { DigitalOceanAuthGuard } from '../guards/digital-ocean-auth.guard';

@Controller('digital-ocean')
@UseGuards(DigitalOceanAuthGuard)
export class DigitalOceanController {
  private readonly logger = new Logger('DigitalOcean-Controller');

  constructor(private readonly digitalOceanService: DigitalOceanService) {}

  /**
   * Crea una carpeta con formato veps_(mes en español)_(año)
   * @param month Número del mes (1-12)
   * @param year Año
   */
  @Post('folders')
  @HttpCode(HttpStatus.CREATED)
  async createFolder(
    @Query('month') month: string,
    @Query('year') year: string,
  ): Promise<{ success: boolean; message: string; folderName: string }> {
    this.logger.log(`Creating folder for month: ${month}, year: ${year}`);
    
    if (!month || !year) {
      throw new BadRequestException('Los parámetros month y year son requeridos');
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    if (isNaN(monthNum) || isNaN(yearNum)) {
      throw new BadRequestException('Month y year deben ser números válidos');
    }

    const folderName = DigitalOceanService.generateFolderName(monthNum, yearNum);
    return await this.digitalOceanService.createFolder(folderName);
  }

  /**
   * Verifica si una carpeta existe
   * @param folderName Nombre de la carpeta
   */
  @Get('folders/:folderName/exists')
  async checkFolderExists(@Param('folderName') folderName: string): Promise<{ exists: boolean; folderName: string }> {
    this.logger.log(`Checking if folder exists: ${folderName}`);
    
    if (!folderName) {
      throw new BadRequestException('El nombre de la carpeta es requerido');
    }

    const exists = await this.digitalOceanService.folderExists(folderName);
    return { exists, folderName };
  }

  /**
   * Lista todas las carpetas del bucket
   */
  @Get('folders')
  async listFolders(): Promise<{ folders: string[]; totalCount: number }> {
    this.logger.log('Listing all folders');
    
    const folders = await this.digitalOceanService.listFolders();
    return { folders, totalCount: folders.length };
  }

  /**
   * Busca carpetas por nombre parcial
   * @param searchTerm Término de búsqueda
   */
  @Get('folders/search')
  async searchFolders(@Query('term') searchTerm: string): Promise<{ folders: string[]; totalCount: number; searchTerm: string }> {
    this.logger.log(`Searching folders with term: ${searchTerm}`);
    
    if (!searchTerm) {
      throw new BadRequestException('El parámetro term es requerido para la búsqueda');
    }

    const folders = await this.digitalOceanService.searchFolders(searchTerm);
    return { folders, totalCount: folders.length, searchTerm };
  }

  /**
   * Obtiene todo el contenido de una carpeta
   * @param folderName Nombre de la carpeta
   */
  @Get('folders/:folderName/contents')
  async getFolderContents(@Param('folderName') folderName: string): Promise<FolderContents> {
    this.logger.log(`Getting contents of folder: ${folderName}`);
    
    if (!folderName) {
      throw new BadRequestException('El nombre de la carpeta es requerido');
    }

    return await this.digitalOceanService.getFolderContents(folderName);
  }

  /**
   * Busca archivos por nombre parcial
   * @param searchTerm Término de búsqueda
   * @param folderName Carpeta específica (opcional)
   */
  @Get('files/search')
  async searchFiles(
    @Query('term') searchTerm: string,
    @Query('folder') folderName?: string,
  ): Promise<{ files: FolderItem[]; totalCount: number; searchTerm: string; folder?: string }> {
    this.logger.log(`Searching files with term: ${searchTerm}, folder: ${folderName || 'all'}`);
    
    if (!searchTerm) {
      throw new BadRequestException('El parámetro term es requerido para la búsqueda');
    }

    const files = await this.digitalOceanService.searchFiles(searchTerm, folderName);
    return { 
      files, 
      totalCount: files.length, 
      searchTerm,
      ...(folderName && { folder: folderName })
    };
  }

  /**
   * Renombra un archivo
   * @param oldKey Clave actual del archivo
   * @param newKey Nueva clave del archivo
   */
  @Put('files/rename')
  async renameFile(
    @Body() body: { oldKey: string; newKey: string }
  ): Promise<{ success: boolean; message: string; oldKey: string; newKey: string }> {
    this.logger.log(`Renaming file from: ${body.oldKey} to: ${body.newKey}`);
    
    if (!body.oldKey || !body.newKey) {
      throw new BadRequestException('Los parámetros oldKey y newKey son requeridos');
    }

    return await this.digitalOceanService.renameFile(body.oldKey, body.newKey);
  }

  /**
   * Genera el nombre de carpeta con formato veps_(mes en español)_(año)
   * @param month Número del mes (1-12)
   * @param year Año
   */
  @Get('folders/generate-name')
  generateFolderName(
    @Query('month') month: string,
    @Query('year') year: string,
  ): Promise<{ folderName: string; month: number; year: number }> {
    this.logger.log(`Generating folder name for month: ${month}, year: ${year}`);
    
    if (!month || !year) {
      throw new BadRequestException('Los parámetros month y year son requeridos');
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    if (isNaN(monthNum) || isNaN(yearNum)) {
      throw new BadRequestException('Month y year deben ser números válidos');
    }

    const folderName = DigitalOceanService.generateFolderName(monthNum, yearNum);
    return Promise.resolve({ folderName, month: monthNum, year: yearNum });
  }

  /**
   * Descarga un archivo por nombre
   * @param fileName Nombre del archivo a descargar
   * @param folderName Carpeta específica (opcional)
   * @param res Objeto de respuesta de Express
   */
  @Get('files/download')
  async downloadFileByName(
    @Query('fileName') fileName: string,
    @Query('folder') folderName: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Downloading file: ${fileName} from folder: ${folderName || 'root'}`);
    
    if (!fileName) {
      throw new BadRequestException('El parámetro fileName es requerido');
    }

    try {
      // Buscar el archivo por nombre
      const fileInfo = await this.digitalOceanService.findFileByName(fileName, folderName);
      
      if (!fileInfo) {
        const location = folderName ? `en la carpeta '${folderName}'` : 'en el bucket';
        throw new BadRequestException(`El archivo '${fileName}' no fue encontrado ${location}`);
      }

      // Descargar el archivo
      const fileBuffer = await this.digitalOceanService.downloadFile(fileInfo.key);
      
      // Determinar el tipo MIME basado en la extensión
      const extension = fileName.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      
      switch (extension) {
        case 'pdf':
          mimeType = 'application/pdf';
          break;
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg';
          break;
        case 'png':
          mimeType = 'image/png';
          break;
        case 'txt':
          mimeType = 'text/plain';
          break;
        case 'json':
          mimeType = 'application/json';
          break;
        case 'xml':
          mimeType = 'application/xml';
          break;
        case 'zip':
          mimeType = 'application/zip';
          break;
        case 'doc':
          mimeType = 'application/msword';
          break;
        case 'docx':
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case 'xls':
          mimeType = 'application/vnd.ms-excel';
          break;
        case 'xlsx':
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
      }

      // Configurar headers de respuesta
      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      });

      // Enviar el archivo
      res.send(fileBuffer);
      
      this.logger.log(`File ${fileName} downloaded successfully (${fileBuffer.length} bytes)`);
    } catch (error) {
      this.logger.error(`Error downloading file ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Descarga un archivo por su clave completa
   * @param fileKey Clave completa del archivo (incluyendo carpeta)
   * @param res Objeto de respuesta de Express
   */
  @Get('files/download-by-key')
  async downloadFileByKey(
    @Query('key') fileKey: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Downloading file by key: ${fileKey}`);
    
    if (!fileKey) {
      throw new BadRequestException('El parámetro key es requerido');
    }

    try {
      // Descargar el archivo directamente por su clave
      const fileBuffer = await this.digitalOceanService.downloadFile(fileKey);
      
      // Extraer el nombre del archivo de la clave
      const fileName = fileKey.split('/').pop() || 'download';
      
      // Determinar el tipo MIME basado en la extensión
      const extension = fileName.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      
      switch (extension) {
        case 'pdf':
          mimeType = 'application/pdf';
          break;
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg';
          break;
        case 'png':
          mimeType = 'image/png';
          break;
        case 'txt':
          mimeType = 'text/plain';
          break;
        case 'json':
          mimeType = 'application/json';
          break;
        case 'xml':
          mimeType = 'application/xml';
          break;
        case 'zip':
          mimeType = 'application/zip';
          break;
        case 'doc':
          mimeType = 'application/msword';
          break;
        case 'docx':
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case 'xls':
          mimeType = 'application/vnd.ms-excel';
          break;
        case 'xlsx':
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
      }

      // Configurar headers de respuesta
      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      });

      // Enviar el archivo
      res.send(fileBuffer);
      
      this.logger.log(`File ${fileName} downloaded successfully by key (${fileBuffer.length} bytes)`);
    } catch (error) {
      this.logger.error(`Error downloading file by key ${fileKey}:`, error);
      throw error;
    }
  }
} 