# Secure Node.js Monolith with Azure Cosmos DB NoSQL on AKS

This repository demonstrates a secure, production-grade deployment of a Node.js monolithic application connecting to Azure Cosmos DB NoSQL inside an Azure Kubernetes Service (AKS) cluster. 

It showcases a secure network architecture using an Azure Virtual Network (VNet), private subnets, Private Endpoints, and environment variable configuration via Kubernetes Secrets.

---

## Architecture Overview

* **Backend (`server.js`)**: Express server communicating with Cosmos DB NoSQL using the official `@azure/cosmos` SDK. It exposes API endpoints for database status, item insertion, and data retrieval, binding to all interfaces (`0.0.0.0`) for container compatibility.
* **Frontend (`public/index.html`)**: A modern single-page dashboard designed with a dark glassmorphic UI to visually interact with the database.
* **Secure Networking**: The application communicates with Cosmos DB via an Azure Private Endpoint inside the VNet, ensuring database traffic never traverses the public internet.
* **Secret Configuration**: Connection strings are securely injected at runtime as environment variables (`COSMOS_CONNECTION_STRING`) using Kubernetes Secrets.
* **Zero-ACR Deployment**: Includes a config-driven deployment option that runs the application code directly from a ConfigMap, meaning no container registry (ACR/Docker Hub) is required to deploy.

---

## Directory Structure

```text
├── k8s/
│   ├── secrets.yaml                 # Secure injection of Cosmos DB connection string
│   ├── deployment-configmap.yaml    # ConfigMap-based deployment (Zero-ACR method)
│   ├── deployment-standard.yaml     # Standard image-based deployment
│   └── service.yaml                 # LoadBalancer Service for public IP routing
├── public/
│   └── index.html                   # Glassmorphic web frontend
├── .env.example                     # Environment template for local testing
├── .gitignore                       # Standard rules preventing credential commits
├── Dockerfile                       # Multi-stage production container build
├── package.json                     # Node project definition and dependencies
├── server.js                        # Node Express backend and Cosmos DB logic
└── README.md                        # Documentation
```

---

## Step 1: Local Development & Testing

Before deploying to AKS, you can test the application locally:

1. Clone the repository to your system.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template to create your `.env` file:
   ```bash
   cp .env.example .env
   ```
4. Edit the `.env` file and paste your Cosmos DB primary connection string:
   ```env
   PORT=8080
   COSMOS_CONNECTION_STRING="AccountEndpoint=https://your-cosmos-account.documents.azure.com:443/;AccountKey=your-key-here;"
   ```
5. Run the application:
   ```bash
   npm start
   ```
6. Open your browser and navigate to `http://localhost:8080`.

---

## Step 2: Provisioning Azure Infrastructure (Portal Guide)

For a live demo, configure these resources in the **Azure Portal**:

### 1. Create a Resource Group
* Create a resource group named `rg-cosmos-aks-demo` in your target region (e.g., `Central India`).

### 2. Create the Virtual Network (VNet) & Subnets
* Create a Virtual Network named `vnet-demo` with address space `10.0.0.0/16`.
* Define two subnets:
  * **`aks-subnet`** (`10.0.1.0/24`) — Dedicated to AKS nodes and pods.
  * **`pe-subnet`** (`10.0.2.0/24`) — Dedicated to the Cosmos DB Private Endpoint.

### 3. Create Cosmos DB NoSQL
* Create an Azure Cosmos DB for NoSQL account named `cosmos-node-demo-<unique-name>`.
* **Basics**: Select **Serverless** capacity mode and select **Disable** for Availability Zones if not supported.
* **Networking**: Select **Private endpoint** and click **+ Add**:
  * Name: `cosmos-private-endpoint`, target sub-resource: `SQL`, virtual network: `vnet-demo`, subnet: `pe-subnet`, **Private DNS integration**: `Yes`.
* **Backup Policy**: Set backup redundancy to **Locally-redundant backup storage (LRS)**.
* **Security**: Ensure Key-based Authentication is **Enabled**.

### 4. Manually Create the Database & Container
* Go to your Cosmos DB resource -> **Data Explorer** -> **New Container**.
* Create a database named **`DemoDB`**.
* Create a container named **`Items`** with partition key **`/category`**.

### 5. Create the AKS Cluster
* Create a Kubernetes service named `aks-cosmos-demo` with the **Dev/Test** preset.
* Set the node pool node count to `1` to save costs.
* **Networking**: 
  * Select **Azure CNI** networking and **Bring your own virtual network**.
  * Choose VNet `vnet-demo` and subnet `aks-subnet (10.0.1.0/24)`.
  * Set *Kubernetes service address range* to **`10.240.0.0/16`** and *DNS service IP* to **`10.240.0.10`** (to avoid IP conflicts with your VNet).
  * Under **User assigned managed identity**, select *Create new* and name it `aks-cosmos-identity`.

---

## Step 3: Deploying to the AKS Cluster

1. Connect your terminal or Cloud Shell to the AKS cluster:
   ```bash
   az aks get-credentials --resource-group rg-cosmos-aks-demo --name aks-cosmos-demo --overwrite-existing
   ```
2. Navigate into the cloned repository folder.
3. Open `k8s/secrets.yaml` and paste your plain-text connection string directly inside the double quotes for `COSMOS_CONNECTION_STRING` under the `stringData` section (Kubernetes will base64 encode this automatically on deployment):
   ```yaml
   stringData:
     COSMOS_CONNECTION_STRING: "AccountEndpoint=https://your-cosmos-account.documents.azure.com:443/;AccountKey=your-key-here;"
   ```
4. Deploy the manifests to Kubernetes:
   ```bash
   kubectl apply -f k8s/
   ```
5. Monitor pod startup (wait until status is `1/1 Running`):
   ```bash
   kubectl get pods -w
   ```
6. Get the public external IP address of the routing service:
   ```bash
   kubectl get service node-cosmos-service -w
   ```
7. Open `http://<EXTERNAL-IP>` in your browser to load the dashboard.

---

## Step 4: Enabling Data Explorer Access in Portal (Optional)

Since public network access is disabled on the Cosmos DB account by default, your local browser will be blocked from querying the database inside the Portal's Data Explorer. 

To enable viewing documents in the portal:
1. Go to your Cosmos DB account -> **Networking**.
2. Select **Public endpoint (selected networks)**.
3. Check **Add my current IP** to whitelist your local machine's IP.
4. Check **Accept connections from within public Azure datacenters** to whitelist the portal backend.
5. Click **Save**. Refresh the Data Explorer page after 1 minute.
