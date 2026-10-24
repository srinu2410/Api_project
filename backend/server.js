
const express = require("express");
const sql = require("mssql");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const dbConfig = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || "mssql",
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME || "EmployeeDB",
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  connectionTimeout: 5000,
  requestTimeout: 10000
};

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Get employees
app.get("/api/employees", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT Id, Name, Company, Salary
      FROM dbo.Employees
      ORDER BY Id DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Fetch employees failed:", err.message);
    res.status(500).json({ error: "Could not fetch employees" });
  }
});

// Insert an employee
app.post("/api/employees", async (req, res) => {
  const { name, company, salary } = req.body;

  if (
    typeof name !== "string" || !name.trim() ||
    typeof company !== "string" || !company.trim() ||
    salary === "" || salary === null ||
    salary === undefined || !Number.isFinite(Number(salary)) ||
    Number(salary) < 0
  ) {
    return res.status(400).json({
      error: "Provide a name, company, and valid non-negative salary"
    });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("name", sql.NVarChar(100), name.trim())
      .input("company", sql.NVarChar(150), company.trim())
      .input("salary", sql.Decimal(12, 2), Number(salary))
      .query(`
        INSERT INTO dbo.Employees (Name, Company, Salary)
        OUTPUT INSERTED.Id, INSERTED.Name,
               INSERTED.Company, INSERTED.Salary
        VALUES (@name, @company, @salary);
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error("Insert employee failed:", err.message);
    res.status(500).json({ error: "Could not insert employee" });
  }
});

const port = Number(process.env.PORT || 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Employee API listening on port ${port}`);
});

