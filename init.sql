IF DB_ID('EmployeeDB') IS NULL
BEGIN
    CREATE DATABASE EmployeeDB;
END;
GO

USE EmployeeDB;
GO

IF OBJECT_ID('dbo.Employees', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Employees
    (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        Company NVARCHAR(150) NOT NULL,
        Salary DECIMAL(12,2) NOT NULL
    );
END;
GO

-- Insert sample data only if the table is empty
IF NOT EXISTS (SELECT 1 FROM dbo.Employees)
BEGIN
    INSERT INTO dbo.Employees (Name, Company, Salary)
    VALUES
        ('John Smith', 'ABC Technologies', 55000.00),
        ('Alice Brown', 'XYZ Solutions', 62000.00),
        ('David Wilson', 'ABC Technologies', 48000.00);
END;
GO

IF DB_ID('EmployeeDB') IS NULL
BEGIN
    CREATE DATABASE EmployeeDB;
END;
GO

USE EmployeeDB;
GO
