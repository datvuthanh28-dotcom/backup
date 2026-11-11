IF OBJECT_ID('PromotionTemplates','U') IS NULL
BEGIN
  CREATE TABLE PromotionTemplates (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(160) NOT NULL,
    campaign_type NVARCHAR(40) NOT NULL,
    description NVARCHAR(600) NULL,
    default_discount_percent DECIMAL(5,2) NOT NULL DEFAULT 10,
    default_duration_days INT NOT NULL DEFAULT 7,
    default_budget DECIMAL(18,0) NULL,
    public_title NVARCHAR(160) NULL,
    public_description NVARCHAR(600) NULL,
    banner_url NVARCHAR(500) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    is_archived BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF COL_LENGTH('Promotions','template_id') IS NULL ALTER TABLE Promotions ADD template_id INT NULL;
IF COL_LENGTH('Promotions','slug') IS NULL ALTER TABLE Promotions ADD slug NVARCHAR(180) NULL;
IF COL_LENGTH('Promotions','campaign_type') IS NULL ALTER TABLE Promotions ADD campaign_type NVARCHAR(40) NOT NULL CONSTRAINT DF_Promotions_CampaignType DEFAULT 'manual';
IF COL_LENGTH('Promotions','is_public') IS NULL ALTER TABLE Promotions ADD is_public BIT NOT NULL CONSTRAINT DF_Promotions_IsPublic DEFAULT 1;
IF COL_LENGTH('Promotions','public_title') IS NULL ALTER TABLE Promotions ADD public_title NVARCHAR(160) NULL;
IF COL_LENGTH('Promotions','public_description') IS NULL ALTER TABLE Promotions ADD public_description NVARCHAR(600) NULL;
IF COL_LENGTH('Promotions','banner_url') IS NULL ALTER TABLE Promotions ADD banner_url NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM PromotionTemplates WHERE campaign_type='black_friday')
  INSERT INTO PromotionTemplates(name,campaign_type,description,default_discount_percent,default_duration_days,public_title,public_description)
  VALUES(N'Black Friday',N'black_friday',N'Đợt sale cuối tháng 11 cho các SKU đã được hệ thống sàng lọc.',20,4,N'Black Friday',N'Ưu đãi có giới hạn trên những thiết kế được chọn.');
IF NOT EXISTS (SELECT 1 FROM PromotionTemplates WHERE campaign_type='tet')
  INSERT INTO PromotionTemplates(name,campaign_type,description,default_discount_percent,default_duration_days,public_title,public_description)
  VALUES(N'Tết Maison Rue',N'tet',N'Đợt ưu đãi theo mùa Tết.',15,14,N'Tết Maison Rue',N'Ưu đãi đầu năm trên tuyển chọn Maison Rue.');
IF NOT EXISTS (SELECT 1 FROM PromotionTemplates WHERE campaign_type='summer_sale')
  INSERT INTO PromotionTemplates(name,campaign_type,description,default_discount_percent,default_duration_days,public_title,public_description)
  VALUES(N'Summer Sale',N'summer_sale',N'Đợt sale mùa hè.',15,10,N'Summer Sale',N'Tuyển chọn nhẹ nhàng cho mùa hè.');
IF NOT EXISTS (SELECT 1 FROM PromotionTemplates WHERE campaign_type='year_end')
  INSERT INTO PromotionTemplates(name,campaign_type,description,default_discount_percent,default_duration_days,public_title,public_description)
  VALUES(N'Year End Sale',N'year_end',N'Đợt sale cuối năm.',20,10,N'Year End Sale',N'Khép lại năm với những lựa chọn đặc biệt.');
IF NOT EXISTS (SELECT 1 FROM PromotionTemplates WHERE campaign_type='clearance')
  INSERT INTO PromotionTemplates(name,campaign_type,description,default_discount_percent,default_duration_days,public_title,public_description)
  VALUES(N'Giảm tồn kho',N'clearance',N'Áp dụng nhanh các SKU được đề xuất vì tồn lâu hoặc bán chậm.',15,14,N'Selected Sale',N'Giá đặc biệt trên số lượng giới hạn.');
GO

IF OBJECT_ID('PromotionRecommendationRefreshEvents','U') IS NULL
BEGIN
  CREATE TABLE PromotionRecommendationRefreshEvents (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    source_type NVARCHAR(40) NOT NULL,
    entity_id NVARCHAR(80) NOT NULL,
    reason NVARCHAR(200) NOT NULL,
    event_day DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    processed_at DATETIME2 NULL
  );
  CREATE INDEX IX_PromotionRefreshEvents_Pending ON PromotionRecommendationRefreshEvents(processed_at,created_at);
END
GO

IF OBJECT_ID('PromotionRecommendationSnapshot','U') IS NULL
BEGIN
  CREATE TABLE PromotionRecommendationSnapshot (
    id TINYINT NOT NULL PRIMARY KEY CONSTRAINT CK_PromotionRecommendationSnapshot_Single CHECK (id=1),
    payload_json NVARCHAR(MAX) NOT NULL,
    generated_at DATETIME2 NOT NULL,
    generated_by NVARCHAR(50) NULL
  );
END
GO

CREATE OR ALTER TRIGGER TR_PromotionRefresh_Inventory ON InventoryMovements
AFTER INSERT AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO PromotionRecommendationRefreshEvents(source_type,entity_id,reason)
  SELECT DISTINCT 'inventory',COALESCE(i.variant_id,CONVERT(NVARCHAR(80),i.product_id)),N'Tồn kho thay đổi'
  FROM inserted i
  WHERE NOT EXISTS (SELECT 1 FROM PromotionRecommendationRefreshEvents e WHERE e.processed_at IS NULL AND e.source_type='inventory' AND e.entity_id=COALESCE(i.variant_id,CONVERT(NVARCHAR(80),i.product_id)));
END
GO

CREATE OR ALTER TRIGGER TR_PromotionRefresh_Pricing ON ProductVariants
AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(price) OR UPDATE(cost_price) OR UPDATE(floor_price) OR UPDATE(stock_quantity) OR UPDATE(low_stock_threshold) OR UPDATE(max_stock_threshold)
    INSERT INTO PromotionRecommendationRefreshEvents(source_type,entity_id,reason)
    SELECT DISTINCT 'variant',i.id,N'Giá hoặc ngưỡng tồn kho thay đổi' FROM inserted i
    WHERE NOT EXISTS (SELECT 1 FROM PromotionRecommendationRefreshEvents e WHERE e.processed_at IS NULL AND e.source_type='variant' AND e.entity_id=i.id);
END
GO

CREATE OR ALTER TRIGGER TR_PromotionRefresh_Favorites ON ProductFavorites
AFTER INSERT,UPDATE,DELETE AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO PromotionRecommendationRefreshEvents(source_type,entity_id,reason)
  SELECT 'favorite',CONVERT(NVARCHAR(80),x.product_id),N'Lượt yêu thích thay đổi trong ngày'
  FROM (SELECT product_id FROM inserted UNION SELECT product_id FROM deleted) x
  WHERE NOT EXISTS (SELECT 1 FROM PromotionRecommendationRefreshEvents e WHERE e.source_type='favorite' AND e.entity_id=CONVERT(NVARCHAR(80),x.product_id) AND e.event_day=CAST(GETDATE() AS DATE));
END
GO

CREATE OR ALTER TRIGGER TR_PromotionRefresh_Reviews ON ProductReviews
AFTER INSERT,UPDATE,DELETE AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO PromotionRecommendationRefreshEvents(source_type,entity_id,reason)
  SELECT 'review',CONVERT(NVARCHAR(80),x.product_id),N'Đánh giá sản phẩm thay đổi trong ngày'
  FROM (SELECT product_id FROM inserted UNION SELECT product_id FROM deleted) x
  WHERE NOT EXISTS (SELECT 1 FROM PromotionRecommendationRefreshEvents e WHERE e.source_type='review' AND e.entity_id=CONVERT(NVARCHAR(80),x.product_id) AND e.event_day=CAST(GETDATE() AS DATE));
END
GO

CREATE OR ALTER TRIGGER TR_PromotionRefresh_Orders ON Orders
AFTER INSERT,UPDATE AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO PromotionRecommendationRefreshEvents(source_type,entity_id,reason)
  SELECT DISTINCT 'order',i.id,N'Đơn hàng hoặc trạng thái đơn thay đổi' FROM inserted i
  WHERE NOT EXISTS (SELECT 1 FROM PromotionRecommendationRefreshEvents e WHERE e.processed_at IS NULL AND e.source_type='order' AND e.entity_id=i.id);
END
GO
