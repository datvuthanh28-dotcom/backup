-- Daily analytical mart. One row represents one active SKU on one calendar day.
-- Financial fields are sourced from operational orders; simulated funnel fields
-- are explicitly labelled so they cannot be mistaken for observed behaviour.
IF OBJECT_ID('SkuDailyBusinessMetrics', 'U') IS NULL
BEGIN
    CREATE TABLE SkuDailyBusinessMetrics (
        metric_date DATE NOT NULL,
        variant_id NVARCHAR(100) NOT NULL,
        product_id INT NOT NULL,
        product_code NVARCHAR(50) NULL,
        sku NVARCHAR(100) NOT NULL,
        product_name NVARCHAR(255) NOT NULL,
        audience NVARCHAR(30) NULL,
        category NVARCHAR(100) NULL,
        subcategory NVARCHAR(100) NULL,
        color_name NVARCHAR(100) NULL,
        size_name NVARCHAR(50) NULL,

        list_price DECIMAL(18,0) NOT NULL DEFAULT 0,
        cost_price DECIMAL(18,0) NULL,
        floor_price DECIMAL(18,0) NULL,
        opening_stock INT NULL,
        closing_stock INT NULL,
        min_stock INT NULL,
        max_stock INT NULL,
        stock_received INT NOT NULL DEFAULT 0,
        stock_adjusted INT NOT NULL DEFAULT 0,

        orders_created INT NOT NULL DEFAULT 0,
        orders_recognized INT NOT NULL DEFAULT 0,
        distinct_customers INT NOT NULL DEFAULT 0,
        units_ordered INT NOT NULL DEFAULT 0,
        units_sold INT NOT NULL DEFAULT 0,
        units_cancelled INT NOT NULL DEFAULT 0,
        gross_merchandise_value DECIMAL(18,0) NOT NULL DEFAULT 0,
        product_discount DECIMAL(18,0) NOT NULL DEFAULT 0,
        net_merchandise_revenue DECIMAL(18,0) NOT NULL DEFAULT 0,
        cost_of_goods_sold DECIMAL(18,0) NOT NULL DEFAULT 0,
        gross_profit DECIMAL(18,0) NOT NULL DEFAULT 0,
        refunded_revenue DECIMAL(18,0) NOT NULL DEFAULT 0,

        product_views INT NOT NULL DEFAULT 0,
        add_to_cart_events INT NOT NULL DEFAULT 0,
        checkout_started_events INT NOT NULL DEFAULT 0,
        favorite_adds INT NOT NULL DEFAULT 0,
        favorite_removes INT NOT NULL DEFAULT 0,
        active_favorites_allocated INT NOT NULL DEFAULT 0,
        reviews_created INT NOT NULL DEFAULT 0,
        rating_sum INT NOT NULL DEFAULT 0,

        promotion_orders INT NOT NULL DEFAULT 0,
        promotion_units INT NOT NULL DEFAULT 0,
        promotion_discount DECIMAL(18,0) NOT NULL DEFAULT 0,
        promotion_revenue DECIMAL(18,0) NOT NULL DEFAULT 0,

        data_source NVARCHAR(30) NOT NULL DEFAULT 'actual',
        contains_synthetic_funnel BIT NOT NULL DEFAULT 0,
        financial_data_complete BIT NOT NULL DEFAULT 1,
        inventory_data_complete BIT NOT NULL DEFAULT 0,
        generated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_SkuDailyBusinessMetrics PRIMARY KEY (metric_date, variant_id),
        CONSTRAINT FK_SkuDailyBusinessMetrics_Product FOREIGN KEY (product_id) REFERENCES Products(id),
        CONSTRAINT CK_SkuDailyBusinessMetrics_Source CHECK (data_source IN ('actual','mixed','synthetic')),
        CONSTRAINT CK_SkuDailyBusinessMetrics_Nonnegative CHECK (
            orders_created >= 0 AND orders_recognized >= 0 AND distinct_customers >= 0
            AND units_ordered >= 0 AND units_sold >= 0 AND units_cancelled >= 0
            AND product_views >= 0 AND add_to_cart_events >= 0 AND checkout_started_events >= 0
            AND favorite_adds >= 0 AND favorite_removes >= 0 AND reviews_created >= 0
        )
    );

    CREATE INDEX IX_SkuDailyBusinessMetrics_ProductDate
        ON SkuDailyBusinessMetrics(product_id, metric_date DESC);
    CREATE INDEX IX_SkuDailyBusinessMetrics_SkuDate
        ON SkuDailyBusinessMetrics(sku, metric_date DESC);
    CREATE INDEX IX_SkuDailyBusinessMetrics_ReportDate
        ON SkuDailyBusinessMetrics(metric_date)
        INCLUDE (net_merchandise_revenue, cost_of_goods_sold, gross_profit, units_sold, product_views);
END
GO

