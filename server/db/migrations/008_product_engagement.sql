-- Product favorites, review moderation, and engagement analytics.
IF OBJECT_ID('ProductFavorites', 'U') IS NULL
BEGIN
    CREATE TABLE ProductFavorites (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(id),
        product_id INT NOT NULL FOREIGN KEY REFERENCES Products(id),
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_ProductFavorites_User_Product UNIQUE (user_id, product_id)
    );
    CREATE INDEX IX_ProductFavorites_Product_Active ON ProductFavorites(product_id, is_active);
    CREATE INDEX IX_ProductFavorites_User_Active ON ProductFavorites(user_id, is_active);
END
GO

IF OBJECT_ID('ProductFavoriteEvents', 'U') IS NULL
BEGIN
    CREATE TABLE ProductFavoriteEvents (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        user_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(id),
        product_id INT NOT NULL FOREIGN KEY REFERENCES Products(id),
        event_type NVARCHAR(10) NOT NULL CHECK (event_type IN ('added', 'removed')),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_ProductFavoriteEvents_Product_Date ON ProductFavoriteEvents(product_id, created_at DESC);
END
GO

IF OBJECT_ID('ProductReviews', 'U') IS NULL
BEGIN
    CREATE TABLE ProductReviews (
        id INT IDENTITY(1,1) PRIMARY KEY,
        product_id INT NOT NULL FOREIGN KEY REFERENCES Products(id),
        user_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(id),
        order_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Orders(id),
        order_item_id INT NOT NULL FOREIGN KEY REFERENCES OrderItems(id),
        rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title NVARCHAR(120),
        content NVARCHAR(1500) NOT NULL,
        selected_color NVARCHAR(50),
        selected_size NVARCHAR(50),
        is_verified_purchase BIT NOT NULL DEFAULT 1,
        status NVARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'hidden', 'rejected', 'deleted')),
        moderation_note NVARCHAR(500),
        moderated_by NVARCHAR(50),
        moderated_at DATETIME2,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_ProductReviews_User_Product UNIQUE (user_id, product_id)
    );
    CREATE INDEX IX_ProductReviews_Product_Status ON ProductReviews(product_id, status, created_at DESC);
    CREATE INDEX IX_ProductReviews_User ON ProductReviews(user_id, status);
END
GO
