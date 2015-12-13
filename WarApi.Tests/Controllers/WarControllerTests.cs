using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System;
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
        private Mock<IMapper> _stubMapper;
        private WarController _controller;
        private Mock<IRankingService> _stubRankingService;
        private Mock<IWarRepository> _stubWarRepo;
        private Mock<IMatchFactory> _stubMatchFactory;
        private Mock<IMatchRepository> _stubMatchRepository;

        [TestInitialize]
        public void InitializeTests()
        {
            _stubWarRepo = new Mock<IWarRepository>();
            _stubRankingService = new Mock<IRankingService>();
            _stubMapper = new Mock<IMapper>();
            _stubMatchFactory = new Mock<IMatchFactory>();
            _stubMatchRepository = new Mock<IMatchRepository>();
            _controller = new WarController(_stubMapper.Object, _stubRankingService.Object, _stubWarRepo.Object, _stubMatchFactory.Object, _stubMatchRepository.Object);
            _stubWarRepo.Setup(x => x.Get(ValidWarId)).Returns(new War.War());
            _stubWarRepo.Setup(x => x.Get(InvalidWarId)).Returns((War.War)null);
        }

        [TestMethod()]
        public void GivenValidWarId_CreateMatch_ReturnsMatch()
        {
            // Arrange
            var match = new MatchWithContestants();
            _stubMatchFactory.Setup(x => x.Create(ValidWarId)).Returns(match);
            var matchModel = new Models.Match();
            _stubMapper.Setup(x => x.Map<War.MatchWithContestants, Models.Match>(match)).Returns(matchModel);

            // Act
            var result = _controller.CreateMatch(ValidWarId);

            // Assert
            result.Should().BeOfType<OkNegotiatedContentResult<Models.Match>>();
            ((OkNegotiatedContentResult<Models.Match>)result).Content.Should().Be(matchModel);
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
            var contestants = new[] { new ContestantWithScore(), new ContestantWithScore() };
            var contestantRankingModels = new[] { new ContestantWithScore(), new ContestantWithScore() };
            _stubRankingService.Setup(x => x.GetRankings(ValidWarId)).Returns(contestants);
            for (var i = 0; i < contestants.Length; i++)
            {
                _stubMapper.Setup(x => x.Map<ContestantWithScore, ContestantWithScore>(contestants[i])).Returns(contestantRankingModels[i]);
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
        public void GivenValidWarIdAndValidRequest_Vote_ReturnsNoContent()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest { MatchId = Guid.NewGuid() };
            var voteRequest = new VoteRequest();
            var existingMatch = new War.Match();
            _stubMapper.Setup(x => x.Map<Models.VoteRequest, VoteRequest>(voteRequestModel)).Returns(voteRequest);
            _stubMatchRepository.Setup(x => x.Get(voteRequestModel.MatchId)).Returns(existingMatch);

            // Act
            var result = _controller.Vote(ValidWarId, voteRequestModel);

            // Assert
            VerifySuccess(voteRequest, result);
        }

        [TestMethod()]
        public void GivenInvalidWarId_Vote_ReturnsNotFound()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest();

            // Act
            var result = _controller.Vote(InvalidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<NotFoundResult>();
        }

        [TestMethod()]
        public void GivenValidWarIdAndNull_Vote_ReturnsBadRequest()
        {
            // Arrange

            // Act
            var result = _controller.Vote(ValidWarId, null);

            // Assert
            result.Should().BeOfType<BadRequestErrorMessageResult>();
            ((BadRequestErrorMessageResult)result).Message.Should().Be("Could not deserialize request.");
        }

        [TestMethod()]
        public void GivenValidWarIdAndBadModel_Valid_ReturnsBadRequest()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest();
            _controller.ModelState.AddModelError("something", "went wrong");

            // Act
            var result = _controller.Vote(ValidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<InvalidModelStateResult>();
        }

        [TestMethod()]
        public void GivenValidWarIdAndInvalidMatchId_Valid_ReturnsBadRequest()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest();
            _stubMatchRepository.Setup(x => x.Get(voteRequestModel.MatchId)).Returns((War.Match)null);

            // Act
            var result = _controller.Vote(ValidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<InvalidModelStateResult>();
            ((InvalidModelStateResult)result).ModelState.Keys.Should().Contain(nameof(Models.VoteRequest.MatchId));
        }

        [TestMethod()]
        public void GivenValidWarIdAndExistingMatch_Vote_ReturnsExpectedResult()
        {
            VerifyVoteReturnsExpectedResult(VoteChoice.Contestant1Won, false);
            VerifyVoteReturnsExpectedResult(VoteChoice.Contestant2Won, false);
            VerifyVoteReturnsExpectedResult(VoteChoice.Pass, false);
            VerifyVoteReturnsExpectedResult(VoteChoice.None, true);
        }

        private void VerifyVoteReturnsExpectedResult(VoteChoice existingVoteChoice, bool shouldSucceed)
        {
            // Arrange
            _controller.ModelState.Clear();
            var voteRequestModel = new Models.VoteRequest { MatchId = Guid.NewGuid(), Choice = Models.VoteChoice.Contestant2 };
            var voteRequest = new VoteRequest();
            var match = new War.Match { Result = existingVoteChoice };
            _stubMatchRepository.Setup(x => x.Get(voteRequestModel.MatchId)).Returns(match);
            _stubMapper.Setup(x => x.Map<Models.VoteRequest, VoteRequest>(voteRequestModel)).Returns(voteRequest);

            // Act
            var result = _controller.Vote(ValidWarId, voteRequestModel);

            // Assert            
            if (shouldSucceed)
            {
                VerifySuccess(voteRequest, result);
            }
            else
            {
                VerifyFailure(result);
            }
        }

        private void VerifySuccess(VoteRequest voteRequest, System.Web.Http.IHttpActionResult result)
        {
            result.Should().BeOfType<StatusCodeResult>();
            ((StatusCodeResult)result).StatusCode.Should().Be(HttpStatusCode.NoContent);
            _stubMatchRepository.Verify(x => x.Update(voteRequest), Times.Once);
        }

        private static void VerifyFailure(System.Web.Http.IHttpActionResult result)
        {
            result.Should().BeOfType<InvalidModelStateResult>();
            ((InvalidModelStateResult)result).ModelState.Keys.Should().Contain(nameof(Models.VoteRequest.MatchId));
        }
    }
}