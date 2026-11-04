IF COL_LENGTH('Products', 'collections_json') IS NULL
BEGIN
    ALTER TABLE Products ADD collections_json NVARCHAR(MAX) NULL;
END
GO
