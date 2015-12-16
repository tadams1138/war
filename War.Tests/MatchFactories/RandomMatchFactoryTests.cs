using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System.Collections.Generic;
using System;
using FluentAssertions;
using System.Threading.Tasks;

namespace War.MatchFactories
{
    [TestClass()]
    public class RandomMatchFactoryTests
    {
        private Mock<IContestantRepository> _stubContestantRepository;
        private Mock<IMatchRepository> _stubMatchRepository;
        private RandomMatchStrategy factory;
        private Queue<int> randomNumbers;
        const int WardId = 1234;
        const int ContestantCount = 8765;
        private Contestant _contestant1;
        private Contestant _contestant2;
        private Guid _matchId;

        [TestInitialize]
        public void InitializeTests()
        {
            _contestant1 = new Contestant { Id = Guid.NewGuid() };
            _contestant2 = new Contestant { Id = Guid.NewGuid() };
            _matchId = Guid.NewGuid();
            _stubContestantRepository = new Mock<IContestantRepository>();
            _stubContestantRepository.Setup(x => x.GetCount(WardId)).Returns(ContestantCount);
            _stubMatchRepository = new Mock<IMatchRepository>();
            _stubMatchRepository.Setup(x => x.Create(WardId,
                                                    It.Is<MatchRequest>(m => m.Contestant1 == _contestant1.Id
                                                                            && m.Contestant2 == _contestant2.Id)))
                                .Returns(Task.FromResult(_matchId));
            randomNumbers = new Queue<int>();
            factory = new RandomMatchStrategy(_stubMatchRepository.Object, _stubContestantRepository.Object, GenerateRandomNumber);
        }

        [TestMethod()]
        public async Task GivenRandomNumbers_Create_ReturnsMatchWithContestants()
        {
            // Arrange
            int contestant1Index = 5;
            int contestant2Index = 3;
            randomNumbers.Enqueue(contestant1Index);
            randomNumbers.Enqueue(contestant2Index);
            _stubContestantRepository.Setup(x => x.Get(contestant1Index)).Returns(_contestant1);
            _stubContestantRepository.Setup(x => x.Get(contestant2Index)).Returns(_contestant2);

            // Act
            var result = await factory.Create(WardId);

            // Assert
            VerifyResult(result);
        }

        [TestMethod()]
        public async Task GivenIdenticalRandomNumbers_Create_ReturnsMatchWithNextContestant()
        {
            // Arrange
            int contestant1Index = 5;
            int contestant2Index = 5;
            randomNumbers.Enqueue(contestant1Index);
            randomNumbers.Enqueue(contestant2Index);
            _stubContestantRepository.Setup(x => x.Get(contestant1Index)).Returns(_contestant1);
            _stubContestantRepository.Setup(x => x.Get(contestant2Index + 1)).Returns(_contestant2);

            // Act
            var result = await factory.Create(WardId);

            // Assert
            VerifyResult(result);
        }

        [TestMethod()]
        public async Task GivenUpperlimitTwice_Create_ReturnsMatchWithFirstContestant()
        {
            // Arrange
            int contestant1Index = ContestantCount - 1;
            int contestant2Index = ContestantCount - 1;
            randomNumbers.Enqueue(contestant1Index);
            randomNumbers.Enqueue(contestant2Index);
            _stubContestantRepository.Setup(x => x.Get(contestant1Index)).Returns(_contestant1);
            _stubContestantRepository.Setup(x => x.Get(0)).Returns(_contestant2);

            // Act
            var result = await factory.Create(WardId);

            // Assert
            VerifyResult(result);
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
            upperBound.Should().Be(ContestantCount - 1);
            var randomNumber = randomNumbers.Dequeue();
            return randomNumber;
        }
    }
}