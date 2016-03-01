using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;

namespace WarApi.Mappers
{
    [TestClass()]
    public class VoteRequestMapperTests
    {
        [TestMethod()]
        public void GivenModelVoteRequest_Map_ReturnsWarVoteRequest()
        {
            // Arrange
            var mapper = new Mapper();
            var source = new Models.VoteRequest
            {
                MatchId = Guid.NewGuid(),
                Choice = Models.VoteChoice.Contestant2
            };

            // Act
            var target = mapper.Map<Models.VoteRequest, War.Votes.VoteRequest>(source);

            // Assert
            target.MatchId.Should().Be(source.MatchId);
            ((int)target.Choice).Should().Be((int)source.Choice);
        }
    }
}
