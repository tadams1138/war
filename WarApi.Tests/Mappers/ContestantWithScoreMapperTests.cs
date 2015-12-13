using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using FluentAssertions;
using WarApi.Models;

namespace WarApi.Mappers
{
    [TestClass()]
    public class ContestantWithScoreMapperTests
    {
        [TestMethod()]
        public void GivenWarContestantWithScore_Map_ReturnsModelContestantWithScore()
        {
            // Arrange
            var mapper = new Mapper();
            War.RankingServices.ContestantWithScore source = new War.RankingServices.ContestantWithScore
            {
                Contestant = ContestantMapperTests.CreateTestContestant(),
                Score = 1234
            };

            // Act
            var target = mapper.Map<War.RankingServices.ContestantWithScore, ContestantWithScore>(source);

            // Assert
            ContestantMapperTests.VerifyContestantMapped(source.Contestant, target.Contestant);
            target.Score.Should().Be(source.Score);
        }
    }
}