const express = require("express");
const path = require("path");
const { CosmosClient } = require("@azure/cosmos");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Cosmos DB Configuration
const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = "DemoDB";
const containerId = "Items";

let client = null;
let database = null;
let container = null;
let dbError = null;
let cosmosEndpoint = "Not Connected";

// Helper function to extract endpoint from connection string for UI display (without leaking credentials)
function getEndpointFromConnectionString(connStr) {
  if (!connStr) return "Missing Connection String";
  try {
    const parts = connStr.split(";");
    for (const part of parts) {
      if (part.toLowerCase().startsWith("accountendpoint=")) {
        return part.split("=")[1];
      }
    }
  } catch (e) {
    return "Invalid Connection String Format";
  }
  return "Unknown Endpoint";
}

// Initialize Cosmos DB Client
async function initCosmos() {
  if (!connectionString) {
    const msg = "COSMOS_CONNECTION_STRING environment variable is not defined.";
    console.error(msg);
    dbError = msg;
    return;
  }

  try {
    cosmosEndpoint = getEndpointFromConnectionString(connectionString);
    console.log(`Initializing Cosmos DB Client for endpoint: ${cosmosEndpoint}`);
    
    // Connect using Connection String
    client = new CosmosClient(connectionString);

    // Verify Database exists
    console.log(`Verifying database "${databaseId}" exists...`);
    database = client.database(databaseId);
    await database.read();

    // Verify Container exists
    console.log(`Verifying container "${containerId}" exists...`);
    container = database.container(containerId);
    await container.read();
    
    dbError = null;
    console.log("Cosmos DB verification completed successfully.");
  } catch (err) {
    console.error("Cosmos DB connection or verification failed:", err.message);
    dbError = err.message;
  }
}

// Initialize on startup
initCosmos();

// Endpoint to check status
app.get("/api/status", (req, res) => {
  res.json({
    status: dbError ? "Error" : (client ? "Connected" : "Initializing"),
    endpoint: cosmosEndpoint,
    database: databaseId,
    container: containerId,
    error: dbError,
    environment: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || "development"
    }
  });
});

// Endpoint to get all items
app.get("/api/items", async (req, res) => {
  if (dbError) {
    return res.status(500).json({ error: `Cosmos DB not connected: ${dbError}` });
  }
  if (!container) {
    return res.status(503).json({ error: "Cosmos DB client is initializing, please try again." });
  }

  try {
    console.log("Querying items from Cosmos DB...");
    // Query all items
    const querySpec = {
      query: "SELECT c.id, c.name, c.category, c.quantity, c._ts FROM c ORDER BY c._ts DESC"
    };
    
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    res.json(items);
  } catch (err) {
    console.error("Error querying items:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to create a new item
app.post("/api/items", async (req, res) => {
  if (dbError) {
    return res.status(500).json({ error: `Cosmos DB not connected: ${dbError}` });
  }
  if (!container) {
    return res.status(503).json({ error: "Cosmos DB client is initializing, please try again." });
  }

  const { name, category, quantity } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: "Name and Category are required fields." });
  }

  try {
    const qty = parseInt(quantity, 10) || 1;
    const newItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // unique ID
      name,
      category,
      quantity: qty
    };

    console.log(`Inserting item: ${JSON.stringify(newItem)}`);
    const { resource: createdItem } = await container.items.create(newItem);
    res.status(201).json(createdItem);
  } catch (err) {
    console.error("Error creating item:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to clear all items (deletes items individually)
app.post("/api/items/clear", async (req, res) => {
  if (dbError) {
    return res.status(500).json({ error: `Cosmos DB not connected: ${dbError}` });
  }
  if (!container || !database) {
    return res.status(503).json({ error: "Cosmos DB client is initializing, please try again." });
  }

  try {
    console.log("Querying all items to delete...");
    const { resources: items } = await container.items.readAll().fetchAll();
    console.log(`Deleting ${items.length} items...`);
    
    for (const item of items) {
      await container.item(item.id, item.category).delete();
    }

    res.json({ message: "All items cleared successfully." });
  } catch (err) {
    console.error("Error clearing items:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start express server (listening on 0.0.0.0)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Application is running on http://0.0.0.0:${PORT}`);
});
