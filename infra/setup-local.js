const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const tables = require("./tables.json");

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: process.env.DYNAMO_ENDPOINT || "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

async function setup() {
  const existing = await client.send(new ListTablesCommand({}));
  const existingNames = existing.TableNames || [];

  for (const table of tables.tables) {
    if (existingNames.includes(table.TableName)) {
      console.log(`  ✓ ${table.TableName} (exists)`);
      continue;
    }

    const params = {
      TableName: table.TableName,
      KeySchema: table.KeySchema,
      AttributeDefinitions: table.AttributeDefinitions,
      BillingMode: table.BillingMode,
    };

    if (table.GlobalSecondaryIndexes) {
      params.GlobalSecondaryIndexes = table.GlobalSecondaryIndexes.map((gsi) => ({
        ...gsi,
        ProvisionedThroughput: undefined,
      }));
    }

    await client.send(new CreateTableCommand(params));
    console.log(`  ✓ ${table.TableName} (created)`);
  }

  console.log("\n⚡ All tables ready.");
}

setup().catch((err) => {
  console.error("Setup failed:", err.message);
  console.error("Make sure DynamoDB Local is running: docker run -p 8000:8000 amazon/dynamodb-local");
  process.exit(1);
});
