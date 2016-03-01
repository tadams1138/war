USE [WarApi_Test]
GO

/****** Object: Table [dbo].[Matches] Script Date: 3/1/2016 12:25:50 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

SELECT
	WarId,
	Id AS MatchId,
	(Result - 1) AS Choice,
	VoteDate AS Created,
	AuthenticationType,
	NameIdentifier
INTO [dbo].[Votes]
FROM [dbo].[Matches]
WHERE Result > 0

