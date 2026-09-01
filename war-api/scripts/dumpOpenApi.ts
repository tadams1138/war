import { buildAppWithoutDb } from '../test/setup/testAppNoDb.js';

/**
 * Dev tool for war-ui-default's `generate:api` (war-ui-default-spec.md
 * §5.1): prints this API's OpenAPI document to stdout, built straight from
 * the routes' own JSON Schemas rather than fetched from a deployed
 * environment. `buildAppWithoutDb()` is the right harness for this --
 * app.swagger() depends solely on which routes got registered, never on
 * data, so no database connection is needed to produce it.
 */
async function main(): Promise<void> {
  const { app } = await buildAppWithoutDb();
  await app.ready();
  process.stdout.write(JSON.stringify(app.swagger()));
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
