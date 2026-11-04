IF COL_LENGTH('Products', 'collection_name') IS NULL
BEGIN
    ALTER TABLE Products ADD collection_name NVARCHAR(100) NULL;
END
GO

IF COL_LENGTH('Products', 'material') IS NULL
BEGIN
    ALTER TABLE Products ADD material NVARCHAR(250) NULL;
END
GO
