using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using War.Users;
using War.Votes;
using War.Votes.Sql;

namespace War.Sql.Votes
{
    [TestClass()]
    public class VoteRepositoryTests
    {
        [TestMethod]
        [TestCategory("Integration")]
        public async Task VoteRepository_CRD_Tests()
        {
            const int firstWarId = 1234;
            const int secondWarId = 5678;
            var sqlServerConnectionString = System.Configuration.ConfigurationManager.ConnectionStrings["WarDb"].ConnectionString;
            var repository = new VoteRepository(sqlServerConnectionString);

            var firstVote = await CreateVote(repository, firstWarId);

            var firstVoteWrongWarId = await repository.Get(secondWarId, firstVote.MatchId);
            firstVoteWrongWarId.Should().BeNullOrEmpty();

            var secondVote = await CreateVote(repository, firstWarId);
            var thirdVote = await CreateVote(repository, secondWarId);

            var firstWarCollection = await repository.GetAll(firstWarId);
            VerifyVoteInCollection(firstWarCollection, firstVote);
            VerifyVoteInCollection(firstWarCollection, secondVote);
            VerifyVoteNotInCollection(firstWarCollection, thirdVote);

            var secondWarCollection = await repository.GetAll(secondWarId);
            VerifyVoteNotInCollection(secondWarCollection, firstVote);
            VerifyVoteNotInCollection(secondWarCollection, secondVote);
            VerifyVoteInCollection(secondWarCollection, thirdVote);

            await VerifyVoteDelete(repository, firstWarId, firstVote.MatchId);
            await VerifyVoteDelete(repository, firstWarId, secondVote.MatchId);
            await VerifyVoteDelete(repository, secondWarId, thirdVote.MatchId);
        }

        private static async Task<Vote> CreateVote(VoteRepository repository, int warId)
        {
            var request = CreateTestVote();
            await repository.Add(warId, request);
            var votes = await repository.Get(warId, request.MatchId);
            VerifyRequestInVotesCollection(votes, request);
            return votes.Single(x => x.MatchId == request.MatchId);
        }

        private static async Task VerifyVoteDelete(VoteRepository repository, int warId, Guid matchId)
        {
            await repository.Delete(warId, matchId);
            var afterDelete = await repository.Get(warId, matchId);
            afterDelete.Should().BeNullOrEmpty();
        }

        private static VoteRequest CreateTestVote()
        {
            return new VoteRequest
            {
                MatchId = Guid.NewGuid(),
                Choice = VoteChoice.Contestant2Won,
                UserIdentifier = new UserIdentifier
                {
                    NameIdentifier = Guid.NewGuid().ToString(),
                    AuthenticationType = Guid.NewGuid().ToString(),
                }
            };
        }

        private static void VerifyRequestInVotesCollection(IEnumerable<Vote> votes, VoteRequest request)
        {
            votes.Should().NotBeNullOrEmpty();
            votes.Should().Contain(x => x.MatchId == request.MatchId &&
                                    x.Choice == request.Choice &&
                                    x.UserId != null &&
                                    x.UserId.NameIdentifier == request.UserIdentifier.NameIdentifier &&
                                    x.UserId.AuthenticationType == request.UserIdentifier.AuthenticationType);
        }

        private static void VerifyVoteInCollection(IEnumerable<Vote> voteCollection, Vote vote)
        {
            voteCollection.Should().Contain(x => VoteIsEquivalent(vote, x));
        }

        private static void VerifyVoteNotInCollection(IEnumerable<Vote> voteCollection, Vote vote)
        {
            voteCollection.Should().NotContain(x => VoteIsEquivalent(vote, x));
        }

        private static bool VoteIsEquivalent(Vote vote1, Vote vote2)
        {
            return vote2.MatchId == vote1.MatchId
                        && vote2.Choice == vote1.Choice
                        && vote2.UserId != null
                        && vote2.UserId.NameIdentifier == vote1.UserId.NameIdentifier
                        && vote2.UserId.AuthenticationType == vote1.UserId.AuthenticationType;
        }
    }
}