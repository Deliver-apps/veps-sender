#!/usr/bin/env node

/**
 * Script para probar el sistema de Job Time Scheduler
 * 
 * Uso:
 * node scripts/test-job-scheduler.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const AUTH_TOKEN = 'your-jwt-token-here'; // Reemplazar con token real

const headers = {
  'Authorization': `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json'
};

async function testJobScheduler() {
  console.log('🧪 Iniciando pruebas del Job Time Scheduler...\n');

  try {
    // 1. Obtener estadísticas
    console.log('📊 1. Obteniendo estadísticas...');
    const statsResponse = await axios.get(`${BASE_URL}/job-scheduler/stats`, { headers });
    console.log('✅ Estadísticas:', JSON.stringify(statsResponse.data, null, 2));
    console.log('');

    // 2. Obtener jobs pendientes
    console.log('⏳ 2. Obteniendo jobs pendientes...');
    const pendingResponse = await axios.get(`${BASE_URL}/job-scheduler/pending`, { headers });
    console.log('✅ Jobs pendientes:', JSON.stringify(pendingResponse.data, null, 2));
    console.log('');

    // 3. Obtener jobs listos para ejecutar
    console.log('🚀 3. Obteniendo jobs listos para ejecutar...');
    const readyResponse = await axios.get(`${BASE_URL}/job-scheduler/ready-to-execute`, { headers });
    console.log('✅ Jobs listos:', JSON.stringify(readyResponse.data, null, 2));
    console.log('');

    // 4. Ejecutar jobs manualmente
    console.log('🔄 4. Ejecutando jobs manualmente...');
    const executeResponse = await axios.post(`${BASE_URL}/job-scheduler/execute`, {}, { headers });
    console.log('✅ Resultado de ejecución:', JSON.stringify(executeResponse.data, null, 2));
    console.log('');

    // 5. Obtener jobs por estado
    const statuses = ['PENDING', 'RUNNING', 'FINISHED', 'ERROR'];
    for (const status of statuses) {
      console.log(`📋 5. Obteniendo jobs con estado ${status}...`);
      try {
        const statusResponse = await axios.get(`${BASE_URL}/job-scheduler/status/${status}`, { headers });
        console.log(`✅ Jobs ${status}:`, JSON.stringify(statusResponse.data, null, 2));
      } catch (error) {
        console.log(`⚠️ No hay jobs con estado ${status}`);
      }
      console.log('');
    }

    // 6. Verificar estado de WhatsApp
    console.log('📱 6. Verificando estado de WhatsApp...');
    try {
      const whatsappResponse = await axios.get(`${BASE_URL}/whatsapp/status`, { headers });
      console.log('✅ Estado de WhatsApp:', JSON.stringify(whatsappResponse.data, null, 2));
    } catch (error) {
      console.log('⚠️ No se pudo verificar el estado de WhatsApp:', error.message);
    }
    console.log('');

    console.log('🎉 ¡Todas las pruebas completadas exitosamente!');

  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Función para crear un job de prueba
async function createTestJob() {
  console.log('🔧 Creando job de prueba...\n');

  const testJob = {
    users: [
      {
        id: 109,
        real_name: "JUAN PEREZ",
        alter_name: "Juanito",
        mobile_number: "+5491136585581",
        last_execution: null,
        execution_date: null,
        need_papers: true,
        is_group: false,
        joined_users: [
          {
            cuit: "20-38694960-4",
            name: "CARLOS SALDAÑA"
          }
        ],
        need_z: null,
        need_compra: null,
        need_auditoria: null,
        cuit: "20-38694960-4",
        type: "autónomo"
      }
    ],
    execution_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutos en el futuro
    type: "autónomo",
    folder_name: "veps_enero_2025",
    status: "PENDING"
  };

  try {
    const response = await axios.post(`${BASE_URL}/job-time`, testJob, { headers });
    console.log('✅ Job de prueba creado:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Error creando job de prueba:', error.response?.data || error.message);
    throw error;
  }
}

// Función para monitorear jobs en tiempo real
async function monitorJobs() {
  console.log('👀 Iniciando monitoreo de jobs (Ctrl+C para salir)...\n');

  const monitor = setInterval(async () => {
    try {
      const statsResponse = await axios.get(`${BASE_URL}/job-scheduler/stats`, { headers });
      const stats = statsResponse.data.data;
      
      const timestamp = new Date().toLocaleString('es-AR', { 
        timeZone: 'America/Argentina/Buenos_Aires' 
      });
      
      console.log(`[${timestamp}] 📊 Stats: PENDING: ${stats.pending}, RUNNING: ${stats.running}, FINISHED: ${stats.finished}, ERROR: ${stats.error}`);
      
    } catch (error) {
      console.error('❌ Error en monitoreo:', error.message);
    }
  }, 30000); // Cada 30 segundos

  // Manejar Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo monitoreo...');
    clearInterval(monitor);
    process.exit(0);
  });
}

// Función principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--create-test')) {
    await createTestJob();
  } else if (args.includes('--monitor')) {
    await monitorJobs();
  } else {
    await testJobScheduler();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testJobScheduler,
  createTestJob,
  monitorJobs
};
