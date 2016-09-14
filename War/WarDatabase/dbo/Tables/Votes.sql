CREATE TABLE [dbo].[Votes]
(
	[WarId] INT NOT NULL, 
    [MatchId] UNIQUEIDENTIFIER NOT NULL, 
    [Choice] SMALLINT NOT NULL, 
    [Created] DATETIME2 NOT NULL, 
    [AuthenticationType] NVARCHAR(50) NOT NULL, 
    [NameIdentifier] NVARCHAR(50) NOT NULL 
)
