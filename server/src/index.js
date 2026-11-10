import { loadConfig } from './lib/config.js';
import { createPool } from './lib/db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool); // pastikan skema sentiasa terkini semasa permulaan
createApp({ pool, config }).listen(config.port, () => console.log(`API sedia di port ${config.port}`));
