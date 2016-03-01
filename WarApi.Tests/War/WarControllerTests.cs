using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System;
using System.Collections.Generic;
using System.Net;
using System.Security.Claims;
using System.Threading.Tasks;
using System.Web.Http.Results;
using War.Contestants;
using War.Matches;
using War.Matches.Factories;
using War.RankingServices;
using War.Users;
using War.Votes;
using War.Wars;
using WarApi.Mappers;

namespace WarApi
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
        private Mock<IContestantRepository> _stubContestantRepository;
        private War.Users.User _stubUser;
        private Mock<IUserRepository> _stubUserRepository;
        private Mock<IVoteRepository> _stubVoteRepository;

        [TestInitialize]
        public void InitializeTests()
        {
            _stubVoteRepository = new Mock<IVoteRepository>();
            _stubContestantRepository = new Mock<IContestantRepository>();
            _stubWarRepo = new Mock<IWarRepository>();
            _stubRankingService = new Mock<IRankingService>();
            _stubMatchFactory = new Mock<IMatchFactory>();
            _stubMatchRepository = new Mock<IMatchRepository>();
            _stubUserRepository = new Mock<IUserRepository>();
            var stubClaimsPrincipal = new ClaimsPrincipal();
            _stubUser = new War.Users.User { Id = new UserIdentifier { AuthenticationType = Guid.NewGuid().ToString(), NameIdentifier = Guid.NewGuid().ToString() } };
            _stubMapper = new Mock<IMapper>();
            _stubMapper.Setup(x => x.Map<ClaimsPrincipal, War.Users.User>(stubClaimsPrincipal)).Returns(_stubUser);
            _controller = new WarController(_stubMapper.Object, _stubRankingService.Object, _stubWarRepo.Object, _stubMatchFactory.Object, _stubMatchRepository.Object, _stubContestantRepository.Object, _stubUserRepository.Object, _stubVoteRepository.Object)
            {
                User = stubClaimsPrincipal
            };
            _stubWarRepo.Setup(x => x.Get(ValidWarId)).Returns(Task.FromResult(new War.Wars.War()));
            _stubWarRepo.Setup(x => x.Get(InvalidWarId)).Returns(Task.FromResult((War.Wars.War)null));
        }

        #region CreateMatch Tests

        [TestMethod()]
        public async Task GivenValidWarId_CreateMatch_ReturnsMatch()
        {
            // Arrange
            var match = new MatchWithContestants();
            _stubMatchFactory.Setup(x => x.Create(ValidWarId, _stubUser.Id)).Returns(Task.FromResult(match));
            var matchModel = new Models.Match();
            _stubMapper.Setup(x => x.Map<MatchWithContestants, Models.Match>(match)).Returns(matchModel);
            _stubContestantRepository.Setup(x => x.GetCount(ValidWarId)).Returns(Task.FromResult(2));

            // Act
            var result = await _controller.CreateMatch(ValidWarId);

            // Assert
            _stubUserRepository.Verify(x => x.Upsert(_stubUser), Times.Once);
            result.Should().BeOfType<CreatedNegotiatedContentResult<Models.Match>>();
            ((CreatedNegotiatedContentResult<Models.Match>)result).Content.Should().Be(matchModel);
        }

        [TestMethod()]
        public async Task GivenFewerThan2Contestants_CreateMatch_ReturnsConflict()
        {
            await VerifyConflictReturned(0);
            await VerifyConflictReturned(1);
        }

        [TestMethod()]
        public async Task GivenInvalidWarId_CreateMatch_ReturnsNotFound()
        {
            // Arrange

            // Act
            var result = await _controller.CreateMatch(InvalidWarId);

            // Assert
            _stubUserRepository.Verify(x => x.Upsert(_stubUser), Times.Never);
            result.Should().BeOfType<NotFoundResult>();
        }

        #endregion

        #region GetContestants Tests
        [TestMethod()]
        public async Task GivenValidWarId_GetContestants_ReturnsRankings()
        {
            // Arrange
            var contestants = new[] { new ContestantWithScore(), new ContestantWithScore() };
            var contestantRankingModels = new[] { new Models.ContestantWithScore(), new Models.ContestantWithScore() };
            _stubRankingService.Setup(x => x.GetRankings(ValidWarId)).Returns(Task.FromResult((IEnumerable<ContestantWithScore>)contestants));
            for (var i = 0; i < contestants.Length; i++)
            {
                _stubMapper.Setup(x => x.Map<ContestantWithScore, Models.ContestantWithScore>(contestants[i])).Returns(contestantRankingModels[i]);
            }

            // Act
            var result = await _controller.GetContestants(ValidWarId);

            // Assert
            result.Should().BeOfType<OkNegotiatedContentResult<IEnumerable<Models.ContestantWithScore>>>();
            ((OkNegotiatedContentResult<IEnumerable<Models.ContestantWithScore>>)result).Content.Should().ContainInOrder(contestantRankingModels);
        }

        [TestMethod()]
        public async Task GivenInvalidWarId_GetContestants_ReturnsNotFound()
        {
            // Arrange

            // Act
            var result = await _controller.GetContestants(InvalidWarId);

            // Assert
            result.Should().BeOfType<NotFoundResult>();
        }

        #endregion

        #region Vote Tests

        [TestMethod()]
        public async Task GivenValidWarIdAndValidRequest_Vote_ReturnsNoContent()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest { MatchId = Guid.NewGuid() };
            var voteRequest = new VoteRequest();
            var existingMatch = new War.Matches.Match { UserId = _stubUser.Id };
            _stubMapper.Setup(x => x.Map<Models.VoteRequest, VoteRequest>(voteRequestModel)).Returns(voteRequest);
            _stubMatchRepository.Setup(x => x.Get(ValidWarId, voteRequestModel.MatchId)).Returns(Task.FromResult(existingMatch));

            // Act
            var result = await _controller.Vote(ValidWarId, voteRequestModel);

            // Assert
            VerifyReturnsNoContent(ValidWarId, voteRequest, result);
        }

        [TestMethod()]
        public async Task GivenInvalidWarId_Vote_ReturnsNotFound()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest();

            // Act
            var result = await _controller.Vote(InvalidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<NotFoundResult>();
        }

        [TestMethod()]
        public async Task GivenValidWarIdAndNull_Vote_ReturnsBadRequest()
        {
            // Arrange

            // Act
            var result = await _controller.Vote(ValidWarId, null);

            // Assert
            result.Should().BeOfType<BadRequestErrorMessageResult>();
            ((BadRequestErrorMessageResult)result).Message.Should().Be("Could not deserialize request.");
        }

        [TestMethod()]
        public async Task GivenValidWarIdAndBadModel_Vote_ReturnsBadRequest()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest();
            _controller.ModelState.AddModelError("something", "went wrong");

            // Act
            var result = await _controller.Vote(ValidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<InvalidModelStateResult>();
        }

        [TestMethod()]
        public async Task GivenValidWarIdAndInvalidMatchId_Vote_ReturnsBadRequest()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest();
            _stubMatchRepository.Setup(x => x.Get(ValidWarId, voteRequestModel.MatchId)).Returns(Task.FromResult((War.Matches.Match)null));

            // Act
            var result = await _controller.Vote(ValidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<InvalidModelStateResult>();
            ((InvalidModelStateResult)result).ModelState.Keys.Should().Contain(nameof(Models.VoteRequest.MatchId));
        }

        [TestMethod]
        public async Task GivenWrongUserId_Vote_Returns_Unauthorized()
        {
            // Arrange
            var voteRequestModel = new Models.VoteRequest { MatchId = Guid.NewGuid() };
            var voteRequest = new VoteRequest();
            var existingMatch = new War.Matches.Match { UserId = new UserIdentifier { AuthenticationType = Guid.NewGuid().ToString(), NameIdentifier = Guid.NewGuid().ToString() } };
            _stubMapper.Setup(x => x.Map<Models.VoteRequest, VoteRequest>(voteRequestModel)).Returns(voteRequest);
            _stubMatchRepository.Setup(x => x.Get(ValidWarId, voteRequestModel.MatchId)).ReturnsAsync(existingMatch);

            // Act
            var result = await _controller.Vote(ValidWarId, voteRequestModel);

            // Assert
            result.Should().BeOfType<UnauthorizedResult>();
        }

        [TestMethod()]
        public async Task GivenValidWarIdAndExistingVote_Vote_ReturnsExpectedResult()
        {
            // Arrange
            _controller.ModelState.Clear();
            var voteRequestModel = new Models.VoteRequest { MatchId = Guid.NewGuid(), Choice = Models.VoteChoice.Contestant2 };
            var votes = new List<War.Votes.Vote> { new War.Votes.Vote() };
            var match = new War.Matches.Match { UserId = _stubUser.Id };
            _stubMatchRepository.Setup(x => x.Get(ValidWarId, voteRequestModel.MatchId)).ReturnsAsync(match);
            _stubVoteRepository.Setup(x => x.Get(ValidWarId, voteRequestModel.MatchId)).ReturnsAsync(votes);

            // Act
            var result = await _controller.Vote(ValidWarId, voteRequestModel);

            // Assert            
            result.Should().BeOfType<ConflictResult>();
        }

        #endregion

        private async Task VerifyConflictReturned(int count)
        {
            // Arrange
            _stubContestantRepository.Setup(x => x.GetCount(ValidWarId)).Returns(Task.FromResult(count));

            // Act
            var result = await _controller.CreateMatch(ValidWarId);

            // Assert
            _stubUserRepository.Verify(x => x.Upsert(_stubUser), Times.Never);
            result.Should().BeOfType<ConflictResult>();
        }
        
        private void VerifyReturnsNoContent(int warId, VoteRequest voteRequest, System.Web.Http.IHttpActionResult result)
        {
            result.Should().BeOfType<StatusCodeResult>();
            ((StatusCodeResult)result).StatusCode.Should().Be(HttpStatusCode.NoContent);
            _stubVoteRepository.Verify(x => x.Add(warId, voteRequest), Times.Once);
        }
    }
}