using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Threading.Tasks;
using War.Sql.Tests.Properties;

namespace War.Sql
{
    [TestClass()]
    public class MatchRepositoryTests
    {
        [TestMethod]
        [TestCategory("Integration")]
        public async Task MatchRepository_CRUD_Tests()
        {
            const int firstWarId = 1234;
            const int secondWarId = 5678;
            var repository = new MatchRepository(Settings.Default.WarDb);

            var firstMatch = await CreateMatch(repository, firstWarId);

            var firstMatchWrongWarId = await repository.Get(secondWarId, firstMatch.Id);
            firstMatchWrongWarId.Should().BeNull();

            const VoteChoice voteChoice = VoteChoice.Contestant2Won;
            var voteRequest = new VoteRequest { MatchId = firstMatch.Id, Choice = voteChoice };
            await repository.Update(firstWarId, voteRequest);
            var firstMatchAfterUpdate = await repository.Get(firstWarId, firstMatch.Id);
            VerifyMatchAfterUpdate(voteChoice, firstMatch, firstMatchAfterUpdate);

            var secondMatch = await CreateMatch(repository, firstWarId);
            var thirdMatch = await CreateMatch(repository, secondWarId);

            var firstWarCollection = await repository.GetAll(firstWarId);
            VerifyMatchInCollection(firstWarCollection, firstMatchAfterUpdate);
            VerifyMatchInCollection(firstWarCollection, secondMatch);
            VerifyMatchNotInCollection(firstWarCollection, thirdMatch);

            var secondWarCollection = await repository.GetAll(secondWarId);
            VerifyMatchNotInCollection(secondWarCollection, firstMatchAfterUpdate);
            VerifyMatchNotInCollection(secondWarCollection, secondMatch);
            VerifyMatchInCollection(secondWarCollection, thirdMatch);

            await VerifyMatchDelete(repository, firstWarId, firstMatch.Id);
            await VerifyMatchDelete(repository, firstWarId, secondMatch.Id);
            await VerifyMatchDelete(repository, secondWarId, thirdMatch.Id);
        }

        private static async Task<Match> CreateMatch(MatchRepository repository, int warId)
        {
            var request = CreateTestMatch();
            var id = await repository.Create(warId, request);
            var match = await repository.Get(warId, id);
            VerifyCreatedMatch(id, match, request);
            return match;
        }

        private static async Task VerifyMatchDelete(MatchRepository repository, int warId, Guid matchId)
        {
            await repository.Delete(warId, matchId);
            var afterDelete = await repository.Get(warId, matchId);
            afterDelete.Should().BeNull();
        }

        private static void VerifyMatchAfterUpdate(VoteChoice voteChoice, Match matchAfterCreation, Match matchAfterUpdate)
        {
            matchAfterUpdate.Should().NotBeNull();
            matchAfterUpdate.Id.Should().Be(matchAfterCreation.Id);
            matchAfterUpdate.Contestant1.Should().Be(matchAfterCreation.Contestant1);
            matchAfterUpdate.Contestant2.Should().Be(matchAfterCreation.Contestant2);
            matchAfterUpdate.Result.Should().Be(voteChoice);
            matchAfterUpdate.CreatedDate.Should().Be(matchAfterCreation.CreatedDate);
            matchAfterUpdate.VoteDate.Should().BeAfter(matchAfterCreation.CreatedDate);
        }

        private static MatchRequest CreateTestMatch()
        {
            return new MatchRequest
            {
                Contestant1 = Guid.NewGuid(),
                Contestant2 = Guid.NewGuid()
            };
        }

        private static void VerifyCreatedMatch(Guid id, Match match, MatchRequest request)
        {
            match.Should().NotBeNull();
            match.Id.Should().Be(id);
            match.Contestant1.Should().Be(request.Contestant1);
            match.Contestant2.Should().Be(request.Contestant2);
            match.Result.Should().Be(VoteChoice.None);
            match.VoteDate.HasValue.Should().BeFalse();
            match.CreatedDate.Should().BeCloseTo(DateTime.UtcNow, 1000);
        }

        private static void VerifyMatchInCollection(System.Collections.Generic.IEnumerable<Match> matchCollection, Match match)
        {
            matchCollection.Should().Contain(x => MatchIsEquivalent(match, x));
        }

        private static void VerifyMatchNotInCollection(System.Collections.Generic.IEnumerable<Match> matchCollection, Match match)
        {
            matchCollection.Should().NotContain(x => MatchIsEquivalent(match, x));
        }

        private static bool MatchIsEquivalent(Match match1, Match match2)
        {
            return match2.Id == match1.Id
                        && match2.Contestant1 == match1.Contestant1
                        && match2.Contestant2 == match1.Contestant2
                        && match2.Result == match1.Result;
        }
    }
}