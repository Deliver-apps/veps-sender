import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

// Usar fetch global o importar node-fetch para compatibilidad
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Script para convertir los archivos de la carpeta session.json
 * en un formato que puede ser enviado al endpoint /uploadSession
 */

async function prepareSessionFiles(sessionDir = './session.json') {
  try {
    const sessionFiles = {};
    
    // Leer todos los archivos de la carpeta session.json
    const files = readdirSync(sessionDir);
    
    for (const file of files) {
      const filePath = join(sessionDir, file);
      const fileStats = statSync(filePath);
      
      if (fileStats.isFile()) {
        const fileContent = readFileSync(filePath);
        // Convertir a base64 para enviar por API
        sessionFiles[file] = fileContent.toString('base64');
        console.log(`Prepared file: ${file} (${fileStats.size} bytes)`);
      }
    }
    
    return sessionFiles;
  } catch (error) {
    console.error('Error preparing session files:', error);
    throw error;
  }
}

async function uploadSession(serverUrl = 'http://localhost:3000', backupCurrent = true) {
  try {
    const sessionFiles = await prepareSessionFiles();
    
    const payload = {
      sessionFiles,
      backupCurrent
    };
    
    console.log(`Uploading ${Object.keys(sessionFiles).length} session files...`);
    
    const response = await fetch(`${serverUrl}/uploadSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Session uploaded successfully!');
      console.log('Response:', result);
    } else {
      console.error('❌ Error uploading session:', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to upload session:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const serverUrl = process.argv[2] || 'http://localhost:3000';
  const backupCurrent = process.argv[3] !== 'false';
  
  console.log('🚀 Starting session upload...');
  console.log(`Server URL: ${serverUrl}`);
  console.log(`Backup current session: ${backupCurrent}`);
  
  uploadSession(serverUrl, backupCurrent)
    .then(() => {
      console.log('✅ Upload completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Upload failed:', error);
      process.exit(1);
    });
}

export default { prepareSessionFiles, uploadSession };
