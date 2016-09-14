using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using FluentAssertions;
using WarApi.Models;
using War.Matches.Factories;

namespace WarApi.Mappers
{
    [TestClass()]
    public class MatchMapperTests
    {
        [TestMethod()]
        public void GivenWarMatchWithContestants_Map_ReturnsModelMatch()
        {
            // Arrange
            var mapper = new Mapper();
            var source = new MatchWithContestants
            {
                Id= Guid.NewGuid(),
                Contestant1 = ContestantMapperTests.CreateTestContestant(),
                Contestant2 = ContestantMapperTests.CreateTestContestant()
            };

            // Act
            var target = mapper.Map<MatchWithContestants, Match>(source);

            // Assert
            target.Id.Should().Be(source.Id);
            ContestantMapperTests.VerifyContestantMapped(source.Contestant1, target.Contestant1);
            ContestantMapperTests.VerifyContestantMapped(source.Contestant2, target.Contestant2);
        }
    }
}