-- Campaign rules, product merchandising metadata, deep-discount control and SKU reservations.
IF COL_LENGTH('Products','season_tags') IS NULL ALTER TABLE Products ADD season_tags NVARCHAR(300) NULL;
IF COL_LENGTH('Products','occasion_tags') IS NULL ALTER TABLE Products ADD occasion_tags NVARCHAR(300) NULL;
IF COL_LENGTH('Products','material_tags') IS NULL ALTER TABLE Products ADD material_tags NVARCHAR(300) NULL;
IF COL_LENGTH('Products','lifecycle') IS NULL ALTER TABLE Products ADD lifecycle NVARCHAR(30) NOT NULL CONSTRAINT DF_Products_Lifecycle DEFAULT 'core';
IF COL_LENGTH('Products','giftable') IS NULL ALTER TABLE Products ADD giftable BIT NOT NULL CONSTRAINT DF_Products_Giftable DEFAULT 0;
GO

IF COL_LENGTH('PromotionTemplates','rule_config_json') IS NULL ALTER TABLE PromotionTemplates ADD rule_config_json NVARCHAR(MAX) NULL;
IF COL_LENGTH('PromotionTemplates','minimum_fit_score') IS NULL ALTER TABLE PromotionTemplates ADD minimum_fit_score INT NOT NULL CONSTRAINT DF_PromotionTemplates_MinFit DEFAULT 65;
IF COL_LENGTH('PromotionTemplates','normal_discount_cap') IS NULL ALTER TABLE PromotionTemplates ADD normal_discount_cap DECIMAL(5,2) NOT NULL CONSTRAINT DF_PromotionTemplates_NormalCap DEFAULT 25;
IF COL_LENGTH('PromotionTemplates','absolute_discount_cap') IS NULL ALTER TABLE PromotionTemplates ADD absolute_discount_cap DECIMAL(5,2) NOT NULL CONSTRAINT DF_PromotionTemplates_AbsoluteCap DEFAULT 35;
GO

IF COL_LENGTH('Promotions','max_effective_discount') IS NULL ALTER TABLE Promotions ADD max_effective_discount DECIMAL(5,2) NOT NULL CONSTRAINT DF_Promotions_MaxEffective DEFAULT 25;
IF COL_LENGTH('Promotions','deep_discount_reason_code') IS NULL ALTER TABLE Promotions ADD deep_discount_reason_code NVARCHAR(50) NULL;
IF COL_LENGTH('Promotions','deep_discount_reason_note') IS NULL ALTER TABLE Promotions ADD deep_discount_reason_note NVARCHAR(500) NULL;
IF COL_LENGTH('Promotions','paused_at') IS NULL ALTER TABLE Promotions ADD paused_at DATETIME2 NULL;
IF COL_LENGTH('Promotions','requires_reapproval') IS NULL ALTER TABLE Promotions ADD requires_reapproval BIT NOT NULL CONSTRAINT DF_Promotions_Reapproval DEFAULT 0;
GO

IF COL_LENGTH('PromotionTargets','selection_source') IS NULL ALTER TABLE PromotionTargets ADD selection_source NVARCHAR(20) NOT NULL CONSTRAINT DF_PromotionTargets_Source DEFAULT 'admin';
IF COL_LENGTH('PromotionTargets','fit_score') IS NULL ALTER TABLE PromotionTargets ADD fit_score DECIMAL(5,2) NULL;
IF COL_LENGTH('PromotionTargets','need_score') IS NULL ALTER TABLE PromotionTargets ADD need_score DECIMAL(5,2) NULL;
IF COL_LENGTH('PromotionTargets','suggested_discount') IS NULL ALTER TABLE PromotionTargets ADD suggested_discount DECIMAL(5,2) NULL;
IF COL_LENGTH('PromotionTargets','approved_discount') IS NULL ALTER TABLE PromotionTargets ADD approved_discount DECIMAL(5,2) NULL;
IF COL_LENGTH('PromotionTargets','selection_reason') IS NULL ALTER TABLE PromotionTargets ADD selection_reason NVARCHAR(800) NULL;
IF COL_LENGTH('PromotionTargets','exception_reason') IS NULL ALTER TABLE PromotionTargets ADD exception_reason NVARCHAR(500) NULL;
GO

IF OBJECT_ID('PromotionSkuReservations','U') IS NULL
BEGIN
  CREATE TABLE PromotionSkuReservations (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    promotion_id INT NOT NULL FOREIGN KEY REFERENCES Promotions(id),
    variant_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES ProductVariants(id),
    reserved_from DATETIME2 NOT NULL,
    reserved_until DATETIME2 NOT NULL,
    quantity_reserved INT NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','active','paused_hold','released','conflicted')),
    hold_expires_at DATETIME2 NULL,
    reserved_by NVARCHAR(120) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    released_at DATETIME2 NULL,
    release_reason NVARCHAR(500) NULL
  );
  CREATE INDEX IX_PromotionSkuReservations_Conflict ON PromotionSkuReservations(variant_id,status,reserved_from,reserved_until);
  CREATE INDEX IX_PromotionSkuReservations_Promotion ON PromotionSkuReservations(promotion_id,status);
END
GO

IF OBJECT_ID('PromotionCampaignResults','U') IS NULL
BEGIN
  CREATE TABLE PromotionCampaignResults (
    promotion_id INT NOT NULL PRIMARY KEY FOREIGN KEY REFERENCES Promotions(id),
    forecast_revenue DECIMAL(18,0) NULL,
    actual_revenue DECIMAL(18,0) NULL,
    forecast_gross_profit DECIMAL(18,0) NULL,
    actual_gross_profit DECIMAL(18,0) NULL,
    discount_cost DECIMAL(18,0) NULL,
    units_sold INT NULL,
    stock_before INT NULL,
    stock_after INT NULL,
    cancellation_count INT NULL,
    return_count INT NULL,
    result_classification NVARCHAR(60) NULL,
    calculated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

UPDATE PromotionTemplates SET minimum_fit_score=65,normal_discount_cap=25,absolute_discount_cap=35,
 rule_config_json=CASE campaign_type
  WHEN 'black_friday' THEN N'{"goal":"revenue_growth","durationDays":[3,7],"priorities":["wishlist_low_conversion","margin","stock_depth","sales_decline","size_availability"]}'
  WHEN 'tet' THEN N'{"goal":"revenue_growth","durationDays":[7,14],"priorities":["occasion","giftable","outfit","recent_interest","margin"]}'
  WHEN 'summer_sale' THEN N'{"goal":"inventory_clearance","durationDays":[7,14],"priorities":["summer_material","seasonal_risk","stock","slow_sales","margin"]}'
  WHEN 'year_end' THEN N'{"goal":"inventory_clearance","durationDays":[7,14],"priorities":["stock_age","days_cover","sales_decline","year_end_risk","broken_sizes"]}'
  WHEN 'clearance' THEN N'{"goal":"inventory_clearance","durationDays":[7,21],"priorities":["stock_age","overstock","days_cover","slow_sales","holding_cost"]}'
  ELSE rule_config_json END
WHERE rule_config_json IS NULL;
GO

UPDATE Products SET
  material_tags=COALESCE(material_tags,LOWER(CONCAT(name,' ',COALESCE(collection_name,'')))),
  season_tags=COALESCE(season_tags,CASE
    WHEN LOWER(CONCAT(name,' ',COALESCE(collection_name,''))) LIKE '%linen%' OR LOWER(name) LIKE '%cotton%' OR LOWER(name) LIKE '%short%' THEN 'summer,spring'
    WHEN LOWER(name) LIKE '%cashmere%' OR LOWER(name) LIKE '%wool%' OR LOWER(name) LIKE '%coat%' OR LOWER(name) LIKE '%jacket%' THEN 'autumn,winter'
    ELSE 'all_season' END),
  occasion_tags=COALESCE(occasion_tags,CASE
    WHEN LOWER(CONCAT(name,' ',category)) LIKE '%accessor%' OR LOWER(name) LIKE '%belt%' OR LOWER(name) LIKE '%wallet%' OR LOWER(name) LIKE '%bag%' OR LOWER(name) LIKE '%scarf%' THEN 'gifting,casual'
    WHEN LOWER(name) LIKE '%shirt%' OR LOWER(name) LIKE '%trouser%' OR LOWER(name) LIKE '%dress%' THEN 'workwear,formal,holiday'
    ELSE 'casual' END),
  lifecycle=CASE WHEN is_classic=1 THEN 'core' WHEN launched_at>=DATEADD(day,-60,GETDATE()) THEN 'new' ELSE COALESCE(NULLIF(lifecycle,''),'core') END,
  giftable=CASE WHEN LOWER(CONCAT(name,' ',category)) LIKE '%accessor%' OR LOWER(name) LIKE '%belt%' OR LOWER(name) LIKE '%wallet%' OR LOWER(name) LIKE '%bag%' OR LOWER(name) LIKE '%scarf%' THEN 1 ELSE giftable END
WHERE is_active=1;
GO
