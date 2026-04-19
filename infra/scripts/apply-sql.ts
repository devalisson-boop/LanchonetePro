import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({
  path: resolve(process.cwd(), 'apps/api/.env'),
});

async function run() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL nao encontrado em apps/api/.env.');
  }

  const migrationsDir = resolve(process.cwd(), 'infra/supabase');
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    for (const file of files) {
      const filepath = resolve(migrationsDir, file);
      const sql = await readFile(filepath, 'utf8');
      process.stdout.write(`Aplicando ${file}...\n`);
      await client.query(sql);
    }

    process.stdout.write('Migracoes aplicadas com sucesso.\n');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

