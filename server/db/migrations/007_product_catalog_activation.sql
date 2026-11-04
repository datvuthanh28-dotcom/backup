IF COL_LENGTH('Products', 'is_active') IS NULL
BEGIN
    ALTER TABLE Products ADD is_active BIT NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT 1;
END
GO
