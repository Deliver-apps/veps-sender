const fs = require('fs');

// Usar fetch global o importar node-fetch para compatibilidad
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Script para descargar una sesión desde el servidor
 */

async function downloadSession(serverUrl = 'http://localhost:3000', sessionFileName = null) {
  try {
    const payload = sessionFileName ? { sessionFileName } : {};
    
    console.log('🔄 Downloading session from server...');
    if (sessionFileName) {
      console.log(`Specific file: ${sessionFileName}`);
    } else {
      console.log('Latest session');
    }
    
    const response = await fetch(`${serverUrl}/downloadSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Session downloaded successfully!');
      console.log('Response:', result);
    } else {
      console.error('❌ Error downloading session:', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to download session:', error);
    throw error;
  }
}

async function backupSession(serverUrl = 'http://localhost:3000') {
  try {
    console.log('🔄 Creating backup of current session...');
    
    const response = await fetch(`${serverUrl}/backupSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Session backed up successfully!');
      console.log('Backup file name:', result.fileName);
      console.log('Response:', result);
    } else {
      console.error('❌ Error backing up session:', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Failed to backup session:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const command = process.argv[2] || 'download';
  const serverUrl = process.argv[3] || 'http://localhost:3000';
  const sessionFileName = process.argv[4] || null;
  
  console.log(`🚀 Starting session ${command}...`);
  console.log(`Server URL: ${serverUrl}`);
  
  if (command === 'download') {
    downloadSession(serverUrl, sessionFileName)
      .then(() => {
        console.log('✅ Download completed!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Download failed:', error);
        process.exit(1);
      });
  } else if (command === 'backup') {
    backupSession(serverUrl)
      .then(() => {
        console.log('✅ Backup completed!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Backup failed:', error);
        process.exit(1);
      });
  } else {
    console.error('❌ Unknown command. Use: download or backup');
    process.exit(1);
  }
}

module.exports = { downloadSession, backupSession };
