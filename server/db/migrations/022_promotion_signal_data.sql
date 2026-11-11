IF COL_LENGTH('Products', 'launched_at') IS NULL
    ALTER TABLE Products ADD launched_at DATETIME2 NULL;
GO

IF COL_LENGTH('Products', 'is_classic') IS NULL
    ALTER TABLE Products ADD is_classic BIT NOT NULL CONSTRAINT DF_Products_IsClassic DEFAULT 0;
GO

IF COL_LENGTH('Products', 'is_bestseller') IS NULL
    ALTER TABLE Products ADD is_bestseller BIT NOT NULL CONSTRAINT DF_Products_IsBestseller DEFAULT 0;
GO

