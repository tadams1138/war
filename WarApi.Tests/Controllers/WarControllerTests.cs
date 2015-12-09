using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System.Collections.Generic;
using System.Net;
using System.Web.Http.Results;
using War;
using War.RankingServices;
using WarApi.Mappers;

namespace WarApi.Controllers
{
    [TestClass()]
    public class WarControllerTests
    {
        private const int ValidWarId = 1234;
        private const int InvalidWarId = 2345;
        private Mock<IMatchRepository> _stubMatchRepo;
        private Mock<IMapper> _stubMapper;
        private WarController _controller;
        private Mock<IRankingService> _stubRankingService;
        private Mock<IWarRepository> _stubWarRepo;

        [TestInitialize]
        public void InitializeTests()
        {
            _stubWarRepo = new Mock<IWarRepository>();
            _stubMatchRepo = new Mock<IMatchRepository>();
            _stubRankingService = new Mock<IRankingService>();
            _stubMapper = new Mock<IMapper>();
            _controller = new WarController(_stubMatchRepo.Object, _stubMapper.Object, _stubRankingService.Object, _stubWarRepo.Object);
            _stubWarRepo.Setup(x => x.Get(ValidWarId)).Returns(new War.War());
            _stubWarRepo.Setup(x => x.Get(InvalidWarId)).Returns((War.War)null);
        }

        [TestMethod()]
        public void GivenValidWarId_CreateMatch_ReturnsMatch()
        {
            // Arrange
            var match = new War.Match();
            _stubMatchRepo.Setup(x => x.Create(ValidWarId)).Returns(match);
            var matchModel = new Match();
            _stubMapper.Setup(x => x.Map<Match>(match)).Returns(matchModel);

            // Act
            var result = _controller.CreateMatch(ValidWarId);

            // Assert
            result.Should().BeOfType<OkNegotiatedContentResult<Match>>();
            ((OkNegotiatedContentResult<Match>)result).Content.Should().Be(matchModel);
        }

        [TestMethod()]
        public void GivenInvalidWarId_CreateMatch_ReturnsNotFound()
        {
            // Arrange

            // Act
            var result = _controller.CreateMatch(InvalidWarId);

            // Assert
            result.Should().BeOfType<NotFoundResult>();
        }

        [TestMethod()]
        public void GivenValidWarId_GetContestants_ReturnsRankings()
        {
            // Arrange
            var contestants = new[] { new War.ContestantWithScore(), new War.ContestantWithScore() };
            var contestantRankingModels = new[] { new ContestantWithScore(), new ContestantWithScore() };
            _stubRankingService.Setup(x => x.GetRankings(ValidWarId)).Returns(contestants);
            for (var i = 0; i < contestants.Length; i++)
            {
                _stubMapper.Setup(x => x.Map<ContestantWithScore>(contestants[i])).Returns(contestantRankingModels[i]);
            }

            // Act
            var result = _controller.GetContestants(ValidWarId);

            // Assert
            result.Should().BeOfType<OkNegotiatedContentResult<IEnumerable<ContestantWithScore>>>();
            ((OkNegotiatedContentResult<IEnumerable<ContestantWithScore>>)result).Content.Should().ContainInOrder(contestantRankingModels);
        }

        [TestMethod()]
        public void GivenInvalidWarId_GetContestants_ReturnsNotFound()
        {
            // Arrange

            // Act
            var result = _controller.GetContestants(InvalidWarId);

            // Assert
            result.Should().BeOfType<NotFoundResult>();
        }

        [TestMethod()]
        public void GivenValidWarIdAndValidRequest_UpdateVote_ReturnsNoContent()
        {
            // Arrange
            var voteRequestModel = new VoteRequest();
            var voteRequest = new War.VoteRequest();
            _stubMapper.Setup(x => x.Map<War.VoteRequest>(voteRequestModel)).Returns(voteRequest);

            // Act
            var result = _controller.UpdateVote(ValidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<StatusCodeResult>();
            ((StatusCodeResult)result).StatusCode.Should().Be(HttpStatusCode.NoContent);
            _stubMatchRepo.Verify(x => x.Update(voteRequest), Times.Once);
        }

        [TestMethod()]
        public void GivenInvalidWarId_UpdateVote_ReturnsNotFound()
        {
            // Arrange
            var voteRequestModel = new VoteRequest();

            // Act
            var result = _controller.UpdateVote(InvalidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<NotFoundResult>();
        }

        [TestMethod()]
        public void GivenValidWarIdAndNull_UpdateVote_ReturnsBadRequest()
        {
            // Arrange

            // Act
            var result = _controller.UpdateVote(ValidWarId, null);

            // Assert
            result.Should().BeOfType<BadRequestErrorMessageResult>();
            ((BadRequestErrorMessageResult)result).Message.Should().Be("Could not deserialize request.");
        }

        [TestMethod()]
        public void GivenValidWarIdAndBadModel_UpdateVote_ReturnsBadRequest()
        {
            // Arrange
            var voteRequestModel = new VoteRequest();
            _controller.ModelState.AddModelError("something", "went wrong");

            // Act
            var result = _controller.UpdateVote(ValidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<InvalidModelStateResult>();
        }
    }
}