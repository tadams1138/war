using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System.Collections.Generic;
using System;
using FluentAssertions;
using System.Threading.Tasks;
using System.Linq;
using System.Text;

namespace War.MatchFactories
{
    [TestClass()]
    public class RandomMatchStrategyTests
    {
        private Mock<IContestantRepository> _stubContestantRepository;
        private Mock<IMatchRepository> _stubMatchRepository;
        private RandomMatchStrategy _factory;
        private Queue<int> randomNumbers;
        const int WarId = 1234;
        const int ContestantCount = 8765;
        private Contestant _contestant1;
        private Contestant _contestant2;
        private Guid _matchId;
        private int firstRandomNumber;
        private int secondRandomNumber;
        private UserIdentifier _userId;

        [TestInitialize]
        public void InitializeTests()
        {
            _userId = new UserIdentifier();
            _contestant1 = new Contestant { Id = Guid.NewGuid() };
            _contestant2 = new Contestant { Id = Guid.NewGuid() };
            _matchId = Guid.NewGuid();
            _stubContestantRepository = new Mock<IContestantRepository>();
            _stubContestantRepository.Setup(x => x.GetCount(WarId)).Returns(Task.FromResult(ContestantCount));
            _stubMatchRepository = new Mock<IMatchRepository>();
            _stubMatchRepository.Setup(x => x.Create(WarId,
                                                    It.Is<MatchRequest>(m => m.Contestant1 == _contestant1.Id
                                                                            && m.Contestant2 == _contestant2.Id
                                                                            && m.UserIdentifier == _userId)))
                                .Returns(Task.FromResult(_matchId));
            randomNumbers = new Queue<int>();
            _factory = new RandomMatchStrategy(_stubMatchRepository.Object, _stubContestantRepository.Object, GenerateRandomNumber);
        }

        [TestMethod()]
        public async Task GivenRandomNumbers_Create_ReturnsMatchWithContestants()
        {
            // Arrange
            firstRandomNumber = 5;
            secondRandomNumber = 3;
            _stubContestantRepository.Setup(x => x.Get(WarId, firstRandomNumber)).Returns(Task.FromResult(_contestant1));
            _stubContestantRepository.Setup(x => x.Get(WarId, secondRandomNumber)).Returns(Task.FromResult(_contestant2));

            // Act
            var result = await _factory.Create(WarId, _userId);

            // Assert
            VerifyResult(result);
        }

        [TestMethod()]
        public async Task GivenIdenticalRandomNumbers_Create_ReturnsMatchWithLastContestant()
        {
            // Arrange
            firstRandomNumber = 5;
            secondRandomNumber = 5;
            _stubContestantRepository.Setup(x => x.Get(WarId, firstRandomNumber)).Returns(Task.FromResult(_contestant1));
            _stubContestantRepository.Setup(x => x.Get(WarId, ContestantCount - 1)).Returns(Task.FromResult(_contestant2));

            // Act
            var result = await _factory.Create(WarId, _userId);

            // Assert
            VerifyResult(result);
        }

        [TestMethod()]
        [TestCategory("Integration")]
        public async Task GivenMultipleCandidates_EachOneIsReturnedInStatisticallyEvenNumber()
        {
            // Arrange
            const int warId = 987;
            const int contestantCount = 10;
            const int iterations = 100000;
            const float lowerBoundPercentage = 0.9f;
            const float upperBoundPercentage = 1.1f;
            List<Contestant> contestants = CreateContestantsCollection(contestantCount);
            SetupContestantRepository(warId, contestants);
            var factory = new RandomMatchStrategy(_stubMatchRepository.Object, _stubContestantRepository.Object);
            var matches = new List<MatchWithContestants>();

            // Act
            for (var i = 0; i < iterations; i++)
            {
                var match = await factory.Create(warId, _userId);
                matches.Add(match);
            }

            // Assert
            var groupedByContestant1 = matches.GroupBy(x => x.Contestant1.Id);
            foreach (var g in groupedByContestant1)
            {
                const float expectedCount = (iterations / contestantCount);
                var actualCount = (float)g.Count();
                actualCount.Should().BeInRange(expectedCount * lowerBoundPercentage, expectedCount * upperBoundPercentage);
                float expectedRivalCounts = actualCount / (contestantCount - 1);
                var groupedByContestant2 = g.GroupBy(x => x.Contestant2.Id);
                groupedByContestant2.Select(x => (float)x.Count()).Should().OnlyContain(x => x >= expectedRivalCounts * lowerBoundPercentage && x <= expectedRivalCounts * upperBoundPercentage);
            }
        }

        private string FormatAsString(IEnumerable<int> enumerable)
        {
            var sb = new StringBuilder();
            foreach (var i in enumerable)
                sb.AppendFormat("{0},", i);
            return sb.ToString();
        }

        private void SetupContestantRepository(int warId, List<Contestant> contestants)
        {
            _stubContestantRepository.Setup(x => x.GetCount(warId)).Returns(Task.FromResult(contestants.Count));

            for (var i = 0; i < contestants.Count; i++)
                _stubContestantRepository.Setup(x => x.Get(warId, i)).Returns(Task.FromResult(contestants[i]));
        }

        private static List<Contestant> CreateContestantsCollection(int count)
        {
            var contestants = new List<Contestant>();
            for (var i = 0; i < count; i++)
            {
                var contestant = new Contestant { Id = Guid.NewGuid() };
                contestants.Add(contestant);
            }

            return contestants;
        }

        private void VerifyResult(MatchWithContestants result)
        {
            result.Id.Should().NotBeEmpty();
            result.Contestant1.Should().Be(_contestant1);
            result.Contestant2.Should().Be(_contestant2);
        }

        private int GenerateRandomNumber(int lowerBound, int upperBound)
        {
            lowerBound.Should().Be(0);
            upperBound.Should().BeOneOf(new[] { ContestantCount, ContestantCount - 1 });
            if (upperBound == ContestantCount)
            {
                return firstRandomNumber;
            }
            else
            {
                return secondRandomNumber;
            }
        }
    }
}