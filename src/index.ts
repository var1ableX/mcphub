import 'reflect-metadata';
import AppServer from './server.js';
import { initializeDatabaseMode } from './utils/migration.js';

const appServer = new AppServer();

async function boot() {
  try {
    // Check if database mode is enabled
    if (process.env.USE_DATABASE_DAO === 'true') {
      console.log('Database mode enabled, initializing...');
      const dbInitialized = await initializeDatabaseMode();
      if (!dbInitialized) {
        console.error('Failed to initialize database mode');
        process.exit(1);
      }
    }

    await appServer.initialize();
    appServer.start();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

boot();

export default appServer.getApp();
