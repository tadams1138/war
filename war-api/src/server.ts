import { buildApp } from './app.js';
import { assertProductionConfig, loadConfig } from './config.js';
import { buildProviderRegistry } from './auth/providerRegistry.js';
import { createDb } from './db/index.js';
import { S3ObjectStorage } from './contestants/storage.js';

async function main(): Promise<void> {
  const config = loadConfig();
  assertProductionConfig(config);
  const db = createDb(config.databaseUrl);
  const providers = buildProviderRegistry(config);
  const storage = new S3ObjectStorage(config.s3);

  const app = await buildApp({ db, providers, storage, config });
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
