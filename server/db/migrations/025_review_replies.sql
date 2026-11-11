IF OBJECT_ID('ReviewReplies','U') IS NULL
BEGIN
  CREATE TABLE ReviewReplies (
    id INT IDENTITY(1,1) PRIMARY KEY,
    review_id INT NOT NULL UNIQUE FOREIGN KEY REFERENCES ProductReviews(id),
    content NVARCHAR(1500) NOT NULL,
    created_by NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(id),
    created_by_role NVARCHAR(20) NOT NULL,
    is_visible BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    deleted_at DATETIME2 NULL,
    deleted_by NVARCHAR(50) NULL
  );
  CREATE INDEX IX_ReviewReplies_Visible ON ReviewReplies(review_id,is_visible);
END
GO

IF OBJECT_ID('ReviewReplyHistory','U') IS NULL
BEGIN
  CREATE TABLE ReviewReplyHistory (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    reply_id INT NOT NULL FOREIGN KEY REFERENCES ReviewReplies(id),
    review_id INT NOT NULL,
    action NVARCHAR(30) NOT NULL,
    previous_content NVARCHAR(1500) NULL,
    new_content NVARCHAR(1500) NULL,
    performed_by NVARCHAR(50) NOT NULL,
    performed_by_role NVARCHAR(20) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_ReviewReplyHistory_Review ON ReviewReplyHistory(review_id,created_at DESC);
END
GO
