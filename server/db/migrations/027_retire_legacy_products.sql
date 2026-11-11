SET XACT_ABORT ON;

DECLARE @LegacyProducts TABLE (
  id INT PRIMARY KEY,
  product_code NVARCHAR(100) NOT NULL
);
DECLARE @NewlyRetiredProducts TABLE (
  id INT PRIMARY KEY,
  product_code NVARCHAR(100) NOT NULL
);
DECLARE @Actor NVARCHAR(120) = N'System: legacy product retirement';

BEGIN TRY
  BEGIN TRANSACTION;

  INSERT INTO @LegacyProducts (id, product_code)
  SELECT p.id, p.product_code
  FROM Products p
  WHERE TRY_CONVERT(
    INT,
    RIGHT(
      LTRIM(RTRIM(p.product_code)),
      PATINDEX('%[^0-9]%', REVERSE(LTRIM(RTRIM(p.product_code))) + 'X') - 1
    )
  ) <= 105;

  INSERT INTO @NewlyRetiredProducts (id, product_code)
  SELECT p.id, p.product_code
  FROM Products p
  JOIN @LegacyProducts legacy ON legacy.id = p.id
  WHERE p.is_active = 1;

  UPDATE p
  SET is_active = 0,
      deactivated_at = COALESCE(p.deactivated_at, GETDATE()),
      deactivated_by = COALESCE(p.deactivated_by, @Actor),
      updated_by = COALESCE(p.updated_by, @Actor),
      updated_at = GETDATE()
  FROM Products p
  JOIN @LegacyProducts legacy ON legacy.id = p.id;

  UPDATE v
  SET is_active = 0,
      deactivated_at = COALESCE(v.deactivated_at, GETDATE()),
      deactivated_by = COALESCE(v.deactivated_by, @Actor),
      updated_by = COALESCE(v.updated_by, @Actor),
      updated_at = GETDATE()
  FROM ProductVariants v
  JOIN @LegacyProducts legacy ON legacy.id = v.product_id
  WHERE v.is_active = 1 AND ISNULL(v.individually_deactivated, 0) = 0;

  INSERT INTO InventoryMovements (
    product_id, movement_type, quantity_change, resulting_stock,
    reference_id, note, performed_by, created_at
  )
  SELECT id, N'product_deactivated', 0, 0,
         product_code, N'Ngừng kinh doanh dữ liệu sản phẩm mã 105 trở xuống.',
         @Actor, GETDATE()
  FROM @NewlyRetiredProducts;

  IF OBJECT_ID(N'PromotionRecommendationSnapshot', N'U') IS NOT NULL
  BEGIN
    UPDATE PromotionRecommendationSnapshot
    SET generated_at = DATEADD(hour, -2, GETDATE())
    WHERE id = 1;
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
