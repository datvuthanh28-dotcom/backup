IF COL_LENGTH('PromotionCodes','distribution_type') IS NULL
  ALTER TABLE PromotionCodes ADD distribution_type NVARCHAR(20) NOT NULL
    CONSTRAINT DF_PromotionCodes_Distribution DEFAULT 'public';
IF COL_LENGTH('PromotionCodes','display_description') IS NULL
  ALTER TABLE PromotionCodes ADD display_description NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_PromotionCodes_Distribution')
  ALTER TABLE PromotionCodes ADD CONSTRAINT CK_PromotionCodes_Distribution
    CHECK(distribution_type IN ('public','targeted','private'));
GO

IF OBJECT_ID('PromotionCodeAssignments','U') IS NULL
BEGIN
  CREATE TABLE PromotionCodeAssignments(
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    promotion_code_id INT NOT NULL FOREIGN KEY REFERENCES PromotionCodes(id),
    user_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(id),
    status NVARCHAR(20) NOT NULL DEFAULT 'available'
      CHECK(status IN ('available','used','revoked')),
    assigned_by NVARCHAR(120) NULL,
    assigned_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    viewed_at DATETIME2 NULL,
    used_at DATETIME2 NULL,
    CONSTRAINT UQ_PromotionCodeAssignments_CodeUser UNIQUE(promotion_code_id,user_id)
  );
  CREATE INDEX IX_PromotionCodeAssignments_UserStatus
    ON PromotionCodeAssignments(user_id,status,promotion_code_id);
END
GO

