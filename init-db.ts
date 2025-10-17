import pkg from "pg";
const { Pool } = pkg;
import { exec } from "child_process";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const {
    DATABASE_AUTHENTICATOR,
    DATABASE_AUTHENTICATOR_PASSWORD,
    DATABASE_NAME,
    DATABASE_OWNER,
    DATABASE_OWNER_PASSWORD,
    DATABASE_VISITOR,
    ROOT_DATABASE_URL,
  } = process.env;
  // exit if any of the above is undefined, and tell me which one is undefined

  if (
    !DATABASE_AUTHENTICATOR ||
    !DATABASE_AUTHENTICATOR_PASSWORD ||
    !DATABASE_NAME ||
    !DATABASE_OWNER ||
    !DATABASE_OWNER_PASSWORD ||
    !DATABASE_VISITOR ||
    !ROOT_DATABASE_URL
  ) {
    if (!DATABASE_AUTHENTICATOR) {
      console.log("DATABASE_AUTHENTICATOR is not defined");
    }
    if (!DATABASE_AUTHENTICATOR_PASSWORD) {
      console.log("DATABASE_AUTHENTICATOR_PASSWORD is not defined");
    }
    if (!DATABASE_NAME) {
      console.log("DATABASE_NAME is not defined");
    }
    if (!DATABASE_OWNER) {
      console.log("DATABASE_OWNER is not defined");
    }
    if (!DATABASE_OWNER_PASSWORD) {
      console.log("DATABASE_OWNER_PASSWORD is not defined");
    }
    if (!DATABASE_VISITOR) {
      console.log("DATABASE_VISITOR is not defined");
    }
    if (!ROOT_DATABASE_URL) {
      console.log("ROOT_DATABASE_URL is not defined");
    }
    process.exit(1);
  }

  const pgPool = new Pool({
    connectionString: ROOT_DATABASE_URL,
  });

  pgPool.on("error", (err) => {
    console.log(
      "An error occurred while trying to talk to the database: " + err.message
    );
  });

  let attempts = 0;
  while (true) {
    try {
      await pgPool.query('select true as "Connection test";');
      break;
    } catch (e: any) {
      if (e.code === "28P01") {
        throw e;
      }
      attempts++;
      if (attempts <= 30) {
        console.log(
          `The database is not ready yet (attempt ${attempts}): ${e.message}`
        );
      } else {
        console.log(`The database never came up, aborting :(`);
        process.exit(1);
      }
      await sleep(1000);
    }
  }

  const client = await pgPool.connect();

  try {
    await client.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME};`);
    await client.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME}_shadow;`);
    await client.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME}_test;`);
    await client.query(`DROP ROLE IF EXISTS ${DATABASE_VISITOR};`);
    await client.query(`DROP ROLE IF EXISTS ${DATABASE_AUTHENTICATOR};`);
    await client.query(`DROP ROLE IF EXISTS ${DATABASE_OWNER};`);
    console.log("The following roles and databases have been dropped:");
    console.log(
      `DATABASE_NAME: ${DATABASE_NAME}, ${DATABASE_NAME}_shadow, ${DATABASE_NAME}_test`
    );
    console.log(`DATABASE_VISITOR: ${DATABASE_VISITOR}`);
    console.log(`DATABASE_AUTHENTICATOR: ${DATABASE_AUTHENTICATOR}`);
    console.log(`DATABASE_OWNER: ${DATABASE_OWNER}`);

    await client.query(
      `CREATE ROLE ${DATABASE_OWNER} WITH LOGIN PASSWORD '${DATABASE_OWNER_PASSWORD}' SUPERUSER;`
    );
    await client.query(
      `CREATE ROLE ${DATABASE_AUTHENTICATOR} WITH LOGIN PASSWORD '${DATABASE_AUTHENTICATOR_PASSWORD}' NOINHERIT;`
    );
    await client.query(`CREATE ROLE ${DATABASE_VISITOR};`);
    await client.query(
      `GRANT ${DATABASE_VISITOR} TO ${DATABASE_AUTHENTICATOR};`
    );
    console.log();
    console.log("The following roles have been created:");

    console.log(`DATABASE_VISITOR: ${DATABASE_VISITOR}`);
    console.log(`DATABASE_AUTHENTICATOR: ${DATABASE_AUTHENTICATOR}`);
    console.log(`DATABASE_OWNER: ${DATABASE_OWNER}`);
  } finally {
    await client.release();
  }
  await pgPool.end();
  exec("pnpm gm reset --erase", (error, stdout, stderr) => {
    if (error) {
      console.error(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout:\n${stdout}`);
  });
  return;
};
main();
