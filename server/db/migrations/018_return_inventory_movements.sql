-- Return/refund and exchange movements need their own auditable inventory types.
-- The original schema used an anonymous CHECK constraint, so locate it by column
-- before replacing it with the stable, idempotent constraint name below.
IF OBJECT_ID('InventoryMovements', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('InventoryMovements') AND name='CK_InventoryMovements_MovementType')
BEGIN
  DECLARE @movementCheckName sysname;
  SELECT TOP 1 @movementCheckName=cc.name
  FROM sys.check_constraints cc
  JOIN sys.columns c ON c.object_id=cc.parent_object_id AND c.column_id=cc.parent_column_id
  WHERE cc.parent_object_id=OBJECT_ID('InventoryMovements') AND c.name='movement_type';

  IF @movementCheckName IS NOT NULL
    EXEC(N'ALTER TABLE InventoryMovements DROP CONSTRAINT [' + @movementCheckName + N']');

  ALTER TABLE InventoryMovements ADD CONSTRAINT CK_InventoryMovements_MovementType
    CHECK (movement_type IN ('order_deduction','order_cancellation_restore','manual_adjustment','restock','return_restock','exchange_deduction'));
END
GO
