
const express = require("express");
const sql = require("mssql");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
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
  connectionTimeout: 10000,
  requestTimeout: 15000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;

function getPool() {
  if (!dbConfig.password) {
    throw new Error("DB_PASSWORD environment variable is missing.");
  }

  if (!poolPromise) {
    const pool = new sql.ConnectionPool(dbConfig);

    pool.on("error", (err) => {
      console.error("SQL connection pool error:", err.message);
    });

    poolPromise = pool.connect().catch((err) => {
      poolPromise = null;
      console.error("SQL connection failed:", err.message);
      throw err;
    });
  }

  return poolPromise;
}

function validId(id) {
  return typeof id === "string" &&
    /^\d+$/.test(id) &&
    Number.isSafeInteger(Number(id)) &&
    Number(id) > 0 &&
    Number(id) <= 2147483647;
}

function validSalaryFilter(value) {
  return typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 9999999999.99 &&
    Math.round(Number(value) * 100) / 100 === Number(value);
}

function validateEmployee(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Employee details are required.";
  }

  const { name, company, salary } = body;

  if (typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100) {
    return "Name is required and must be at most 100 characters.";
  }

  if (typeof company !== "string" ||
      !company.trim() ||
      company.trim().length > 150) {
    return "Company is required and must be at most 150 characters.";
  }

  if (salary === "" || salary === null || salary === undefined) {
    return "Salary is required.";
  }

  const amount = Number(salary);

  if (!Number.isFinite(amount) ||
      amount < 0 ||
      amount > 9999999999.99) {
    return "Salary must be between 0 and 9999999999.99.";
  }

  if (Math.round(amount * 100) / 100 !== amount) {
    return "Salary cannot have more than two decimal places.";
  }

  return null;
}

// Database health check.
app.get("/api/health", async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ok");

    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    console.error("Health check failed:", err.message);
    res.status(503).json({
      status: "error",
      database: "unavailable"
    });
  }
});

// Search employees. No filters means no records are returned.
app.get("/api/employees", async (req, res) => {
  const { id, name = "", company = "", minSalary, maxSalary } = req.query;

  if (typeof name !== "string" ||
      typeof company !== "string" ||
      name.length > 100 ||
      company.length > 150) {
    return res.status(400).json({
      error: "Invalid name or company filter."
    });
  }

  if (id !== undefined && !validId(id)) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  if (minSalary !== undefined && !validSalaryFilter(minSalary)) {
    return res.status(400).json({ error: "Invalid minimum salary." });
  }

  if (maxSalary !== undefined && !validSalaryFilter(maxSalary)) {
    return res.status(400).json({ error: "Invalid maximum salary." });
  }

  if (minSalary !== undefined &&
      maxSalary !== undefined &&
      Number(minSalary) > Number(maxSalary)) {
    return res.status(400).json({
      error: "Minimum salary cannot exceed maximum salary."
    });
  }

  const hasFilters =
    id !== undefined ||
    name.trim() !== "" ||
    company.trim() !== "" ||
    minSalary !== undefined ||
    maxSalary !== undefined;

  if (!hasFilters) {
    return res.json([]);
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    const conditions = [];

    if (id !== undefined) {
      request.input("id", sql.Int, Number(id));
      conditions.push("Id = @id");
    }

    if (name.trim()) {
      request.input("name", sql.NVarChar(202), `%${name.trim()}%`);
      conditions.push("Name LIKE @name");
    }

    if (company.trim()) {
      request.input("company", sql.NVarChar(302), `%${company.trim()}%`);
      conditions.push("Company LIKE @company");
    }

    if (minSalary !== undefined) {
      request.input("minSalary", sql.Decimal(12, 2), Number(minSalary));
      conditions.push("Salary >= @minSalary");
    }

    if (maxSalary !== undefined) {
      request.input("maxSalary", sql.Decimal(12, 2), Number(maxSalary));
      conditions.push("Salary <= @maxSalary");
    }

    const result = await request.query(`
      SELECT Id, Name, Company, Salary
      FROM dbo.Employees
      WHERE ${conditions.join(" AND ")}
      ORDER BY Id ASC;
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Search failed:", err.message);
    res.status(500).json({
      error: "Could not search employees."
    });
  }
});

// Add employee.
app.post("/api/employees", async (req, res) => {
  const error = validateEmployee(req.body);

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input("name", sql.NVarChar(100), req.body.name.trim())
      .input("company", sql.NVarChar(150), req.body.company.trim())
      .input("salary", sql.Decimal(12, 2), Number(req.body.salary))
      .query(`
        INSERT INTO dbo.Employees (Name, Company, Salary)
        OUTPUT INSERTED.Id, INSERTED.Name,
               INSERTED.Company, INSERTED.Salary
        VALUES (@name, @company, @salary);
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error("Insert failed:", err.message);
    res.status(500).json({
      error: "Could not add employee. Check the API logs."
    });
  }
});

// Update employee.
app.put("/api/employees/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  const error = validateEmployee(req.body);

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, Number(req.params.id))
      .input("name", sql.NVarChar(100), req.body.name.trim())
      .input("company", sql.NVarChar(150), req.body.company.trim())
      .input("salary", sql.Decimal(12, 2), Number(req.body.salary))
      .query(`
        UPDATE dbo.Employees
        SET Name = @name,
            Company = @company,
            Salary = @salary
        OUTPUT INSERTED.Id, INSERTED.Name,
               INSERTED.Company, INSERTED.Salary
        WHERE Id = @id;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Employee not found." });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Update failed:", err.message);
    res.status(500).json({
      error: "Could not update employee. Check the API logs."
    });
  }
});

// Delete employee.
app.delete("/api/employees/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, Number(req.params.id))
      .query(`
        DELETE FROM dbo.Employees
        OUTPUT DELETED.Id
        WHERE Id = @id;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Employee not found." });
    }

    res.json({
      message: "Employee deleted successfully.",
      id: result.recordset[0].Id
    });
  } catch (err) {
    console.error("Delete failed:", err.message);
    res.status(500).json({
      error: "Could not delete employee. Check the API logs."
    });
  }
});

// Handle invalid JSON and other Express errors.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof SyntaxError &&
      err.status === 400 &&
      Object.prototype.hasOwnProperty.call(err, "body")) {
    return res.status(400).json({
      error: "Invalid JSON request body."
    });
  }

  console.error("Request error:", err.message);
  res.status(500).json({ error: "Unexpected server error." });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Employee API listening on port ${port}`);
});

server.on("error", (err) => {
  console.error("HTTP server error:", err.message);
  process.exitCode = 1;
});

