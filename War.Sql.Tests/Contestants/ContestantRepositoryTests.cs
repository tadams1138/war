using System;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using FluentAssertions;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace War.Contestants.Sql
{
    [TestClass()]
    public class ContestantRepositoryTests
    {
        private const int WarId = 1234;
        private const int DifferentWarId = 5678;
        private ContestantRepository _repository;

        [TestInitialize]
        public void InitializeTests()
        {
            var sqlServerConnectionString = System.Configuration.ConfigurationManager.ConnectionStrings["WarDb"].ConnectionString;
            _repository = new ContestantRepository(sqlServerConnectionString);
        }

        [TestMethod()]
        [TestCategory("Integration")]
        public async Task GivenIndexOutOfRange_Get_ThrowsException()
        {
            // Arrange
            var contestantRequests = new[] { CreateContestantRequest(),
                CreateContestantRequest() };
            await AddContestants(contestantRequests);
            var count = await _repository.GetCount(WarId);

            // Act and Assert
            await VerifyGetThrowsArgumentOutOfRangeException(-1);
            await VerifyGetThrowsArgumentOutOfRangeException(count);

            // Cleanup
            await CleanupRepository();
        }

        [TestMethod()]
        [TestCategory("Integration")]
        public async Task ContestantRepository_CRUD_Test()
        {
            await CleanupRepository();
            await VerifyWarIsEmpty(WarId);

            var contestantRequests = new[] { CreateContestantRequest(),
                CreateContestantRequest() };
            await AddContestants(contestantRequests);

            await VerifyCount(WarId, contestantRequests.Length);
            await VerifyWarIsEmpty(DifferentWarId);

            await VerifyAllRequestsMatchContestant(contestantRequests);
            await VerifyAllContestantMatchRequest(contestantRequests);

            await VerifyUpdate();

            await CleanupRepository();
        }

        private async Task VerifyUpdate()
        {
            // Arrange
            const int index = 0;
            var contestant = await _repository.Get(WarId, index);
            contestant.Definition[contestant.Definition.Keys.First()] = "new updated value";

            // Act
            await _repository.Update(WarId, contestant);

            // Assert
            var updatedContestant = await _repository.Get(WarId, index);
            updatedContestant.Id.Should().Be(contestant.Id);
            updatedContestant.Definition.Should().Equal(contestant.Definition);
        }

        private async Task VerifyGetThrowsArgumentOutOfRangeException(int index)
        {
            ArgumentOutOfRangeException expectedException = null;
            try
            {
                await _repository.Get(WarId, index);
            }
            catch (ArgumentOutOfRangeException ex)
            {
                expectedException = ex;
            }
            expectedException.Should().NotBeNull();
        }

        private async Task VerifyCount(int warId, int expectedCount)
        {
            var count = await _repository.GetCount(warId);
            count.Should().Be(expectedCount);
        }

        private async Task AddContestants(ContestantRequest[] contestantRequests)
        {
            var tasks = new List<Task>();
            foreach (var c in contestantRequests)
            {
                var task = _repository.Create(WarId, c);
                tasks.Add(task);
            }
            await Task.WhenAll(tasks);
        }

        private async Task CleanupRepository()
        {
            await _repository.DeleteAll(WarId);
            await VerifyWarIsEmpty(WarId);
        }

        private async Task VerifyWarIsEmpty(int warId)
        {
            var allContestants = await _repository.GetAll(warId);
            allContestants.Should().BeNullOrEmpty();
            await VerifyCount(warId, 0);
        }

        private async Task VerifyAllRequestsMatchContestant(ContestantRequest[] contestantRequests)
        {
            var allContestants = await _repository.GetAll(WarId);
            foreach (var r in contestantRequests)
            {
                allContestants.Should().ContainSingle(c => IsTheSame(c, r));
            }
        }

        private async Task VerifyAllContestantMatchRequest(ContestantRequest[] contestantRequests)
        {
            var count = await _repository.GetCount(WarId);
            for (var i = 0; i < count; i++)
            {
                var c = await _repository.Get(WarId, i);
                contestantRequests.Should().ContainSingle(r => IsTheSame(c, r));
            }
        }

        private static bool IsTheSame(Contestant contestant, ContestantRequest request)
        {
            return ContainsAllElementsOf(contestant.Definition, request.Definition) && ContainsAllElementsOf(request.Definition, contestant.Definition);
        }

        private static bool ContainsAllElementsOf(Dictionary<string, string> dictionary1, Dictionary<string, string> dictionary2)
        {
            return dictionary1.All(x => dictionary2.Contains(new KeyValuePair<string, string>(x.Key, x.Value)));
        }

        private static ContestantRequest CreateContestantRequest()
        {
            var definition = new Dictionary<string, string> { { "TestId", Guid.NewGuid().ToString() }, { "TestAttribute", Guid.NewGuid().ToString() } };
            return new ContestantRequest { Definition = definition };
        }
    }
}