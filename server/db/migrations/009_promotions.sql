-- Production-style promotion and voucher foundation. Records are archived, never physically deleted by the application.
IF OBJECT_ID('Promotions', 'U') IS NULL
BEGIN
  CREATE TABLE Promotions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(160) NOT NULL,
    description NVARCHAR(600),
    discount_type NVARCHAR(30) NOT NULL CHECK (discount_type IN ('percentage','fixed_amount','free_shipping','shipping_amount')),
    discount_value DECIMAL(18,2) NOT NULL DEFAULT 0,
    maximum_discount DECIMAL(18,0),
    minimum_order_value DECIMAL(18,0) NOT NULL DEFAULT 0,
    is_automatic BIT NOT NULL DEFAULT 0,
    stacking_policy NVARCHAR(30) NOT NULL DEFAULT 'none' CHECK (stacking_policy IN ('none','allowed','shipping_only')),
    priority INT NOT NULL DEFAULT 0,
    customer_requirement NVARCHAR(20) NOT NULL DEFAULT 'any' CHECK (customer_requirement IN ('any','authenticated')),
    usage_limit_total INT,
    usage_limit_per_customer INT,
    used_count INT NOT NULL DEFAULT 0,
    start_at DATETIME2 NOT NULL,
    end_at DATETIME2,
    status NVARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
    is_archived BIT NOT NULL DEFAULT 0,
    created_by NVARCHAR(50), updated_by NVARCHAR(50),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(), updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_Promotions_ActivePeriod ON Promotions(status,is_archived,start_at,end_at);
END
GO

IF OBJECT_ID('PromotionTargets', 'U') IS NULL
BEGIN
  CREATE TABLE PromotionTargets (
    id INT IDENTITY(1,1) PRIMARY KEY,
    promotion_id INT NOT NULL FOREIGN KEY REFERENCES Promotions(id),
    target_type NVARCHAR(20) NOT NULL CHECK (target_type IN ('store','audience','category','product','variant')),
    target_value NVARCHAR(100) NOT NULL,
    is_excluded BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_PromotionTargets_Promotion ON PromotionTargets(promotion_id,target_type,target_value);
END
GO

IF OBJECT_ID('PromotionCodes', 'U') IS NULL
BEGIN
  CREATE TABLE PromotionCodes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    promotion_id INT NOT NULL FOREIGN KEY REFERENCES Promotions(id),
    code NVARCHAR(50) NOT NULL,
    normalized_code AS UPPER(LTRIM(RTRIM(code))) PERSISTED,
    usage_limit INT,
    used_count INT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(), updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  CREATE UNIQUE INDEX UX_PromotionCodes_Normalized ON PromotionCodes(normalized_code);
END
GO

IF OBJECT_ID('PromotionUsages', 'U') IS NULL
BEGIN
  CREATE TABLE PromotionUsages (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    promotion_id INT NOT NULL FOREIGN KEY REFERENCES Promotions(id),
    promotion_code_id INT FOREIGN KEY REFERENCES PromotionCodes(id),
    order_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Orders(id),
    customer_id NVARCHAR(50),
    discount_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
    shipping_discount DECIMAL(18,0) NOT NULL DEFAULT 0,
    status NVARCHAR(20) NOT NULL DEFAULT 'consumed' CHECK (status IN ('consumed','released','reversed')),
    used_at DATETIME2 NOT NULL DEFAULT GETDATE(), released_at DATETIME2, released_by NVARCHAR(120), release_reason NVARCHAR(500)
  );
  CREATE UNIQUE INDEX UX_PromotionUsages_OrderPromotion ON PromotionUsages(order_id,promotion_id);
  CREATE INDEX IX_PromotionUsages_Customer ON PromotionUsages(customer_id,promotion_id,status);
END
GO

IF OBJECT_ID('PromotionAuditLogs', 'U') IS NULL
BEGIN
  CREATE TABLE PromotionAuditLogs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    promotion_id INT NOT NULL FOREIGN KEY REFERENCES Promotions(id),
    action NVARCHAR(40) NOT NULL,
    previous_data NVARCHAR(MAX), new_data NVARCHAR(MAX),
    performed_by NVARCHAR(120) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF COL_LENGTH('Orders','original_subtotal') IS NULL ALTER TABLE Orders ADD original_subtotal DECIMAL(18,0) NOT NULL CONSTRAINT DF_Orders_OriginalSubtotal DEFAULT 0;
IF COL_LENGTH('Orders','product_discount_total') IS NULL ALTER TABLE Orders ADD product_discount_total DECIMAL(18,0) NOT NULL CONSTRAINT DF_Orders_ProductDiscount DEFAULT 0;
IF COL_LENGTH('Orders','code_discount_total') IS NULL ALTER TABLE Orders ADD code_discount_total DECIMAL(18,0) NOT NULL CONSTRAINT DF_Orders_CodeDiscount DEFAULT 0;
IF COL_LENGTH('Orders','shipping_fee_original') IS NULL ALTER TABLE Orders ADD shipping_fee_original DECIMAL(18,0) NOT NULL CONSTRAINT DF_Orders_ShippingOriginal DEFAULT 0;
IF COL_LENGTH('Orders','shipping_discount_total') IS NULL ALTER TABLE Orders ADD shipping_discount_total DECIMAL(18,0) NOT NULL CONSTRAINT DF_Orders_ShippingDiscount DEFAULT 0;
IF COL_LENGTH('Orders','promotion_code') IS NULL ALTER TABLE Orders ADD promotion_code NVARCHAR(50);
IF COL_LENGTH('Orders','promotion_snapshot_json') IS NULL ALTER TABLE Orders ADD promotion_snapshot_json NVARCHAR(MAX);
GO

IF COL_LENGTH('OrderItems','original_unit_price') IS NULL ALTER TABLE OrderItems ADD original_unit_price DECIMAL(18,0);
IF COL_LENGTH('OrderItems','automatic_discount_total') IS NULL ALTER TABLE OrderItems ADD automatic_discount_total DECIMAL(18,0) NOT NULL CONSTRAINT DF_OrderItems_AutoDiscount DEFAULT 0;
IF COL_LENGTH('OrderItems','order_discount_allocated') IS NULL ALTER TABLE OrderItems ADD order_discount_allocated DECIMAL(18,0) NOT NULL CONSTRAINT DF_OrderItems_OrderDiscount DEFAULT 0;
IF COL_LENGTH('OrderItems','final_line_total') IS NULL ALTER TABLE OrderItems ADD final_line_total DECIMAL(18,0);
IF COL_LENGTH('OrderItems','promotion_snapshot_json') IS NULL ALTER TABLE OrderItems ADD promotion_snapshot_json NVARCHAR(MAX);
GO
