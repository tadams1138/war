using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System;
using System.Collections.Generic;

namespace War.RankingServices
{
    [TestClass()]
    public class SumDistinctWinsRankingServiceTests
    {
        private Guid _aNewHope = Guid.NewGuid();
        private Guid _empireStrikesBack = Guid.NewGuid();
        private Guid _returnOfTheJedi = Guid.NewGuid();
        private Guid _phantomMenace = Guid.NewGuid();
        private Guid _attackOfTheClones = Guid.NewGuid();
        private Guid _revengeOfTheSith = Guid.NewGuid();

        [TestMethod()]
        public void GivenMatches_GetRankings_ReturnsExpectedRankings()
        {
            // Arrange
            int warId = 1234;
            var stubMatchRepo = new Mock<IMatchRepository>();
            var stubContestantRepo = new Mock<IContestantRepository>();
            var matches = new List<Match> {
                new Match { Contestant1 = _aNewHope, Contestant2 = _returnOfTheJedi, Result = MatchResult.Contestant2Won },
                new Match { Contestant1 = _returnOfTheJedi, Contestant2 = _empireStrikesBack, Result = MatchResult.Contestant1Won },
                new Match { Contestant1 = _phantomMenace, Contestant2 = _returnOfTheJedi, Result = MatchResult.Contestant2Won },
                new Match { Contestant1 = _returnOfTheJedi, Contestant2 = _attackOfTheClones, Result = MatchResult.Contestant1Won },
                new Match { Contestant1 = _returnOfTheJedi, Contestant2 = _revengeOfTheSith, Result = MatchResult.Contestant1Won },

                new Match { Contestant1 = _aNewHope, Contestant2 = _empireStrikesBack, Result = MatchResult.Contestant2Won },
                new Match { Contestant1 = _revengeOfTheSith, Contestant2 = _empireStrikesBack, Result = MatchResult.Contestant2Won },
                new Match { Contestant1 = _phantomMenace, Contestant2 = _empireStrikesBack, Result = MatchResult.Contestant2Won },
                new Match { Contestant1 = _attackOfTheClones, Contestant2 = _empireStrikesBack, Result = MatchResult.Contestant2Won },

                new Match { Contestant1 = _aNewHope, Contestant2 = _phantomMenace, Result = MatchResult.Contestant1Won },
                new Match { Contestant1 = _aNewHope, Contestant2 = _attackOfTheClones, Result = MatchResult.Contestant1Won },
                new Match { Contestant1 = _aNewHope, Contestant2 = _revengeOfTheSith, Result = MatchResult.Contestant1Won },

                new Match { Contestant1 = _revengeOfTheSith, Contestant2 = _phantomMenace, Result = MatchResult.Pass },
                new Match { Contestant1 = _attackOfTheClones, Contestant2 = _revengeOfTheSith, Result = MatchResult.Pass },

                new Match { Contestant1 = _attackOfTheClones, Contestant2 = _phantomMenace, Result = MatchResult.None },

                new Match { Contestant1 = _returnOfTheJedi, Contestant2 = _empireStrikesBack, Result = MatchResult.Contestant1Won }, // Duplicate
                new Match { Contestant1 = _empireStrikesBack, Contestant2 = _returnOfTheJedi, Result = MatchResult.Contestant2Won }, // Inverted Order Duplicate
            };

            var contestants = new List<Contestant> {
                new Contestant { Id = _aNewHope },
                new Contestant { Id = _empireStrikesBack } ,
                new Contestant { Id = _returnOfTheJedi } ,
                new Contestant { Id = _phantomMenace } ,
                new Contestant { Id = _attackOfTheClones } ,
                new Contestant { Id = _revengeOfTheSith } };
            stubContestantRepo.Setup(x => x.GetAll(warId)).Returns(contestants);
            stubMatchRepo.Setup(x => x.GetAll(warId)).Returns(matches);
            var service = new SumDistinctWinsRankingService(stubMatchRepo.Object, stubContestantRepo.Object);

            // Act
            var result = service.GetRankings(warId);

            // Assert
            result.Should().Contain(x => x.Contestant.Id == _returnOfTheJedi && x.Score == 7);
            result.Should().Contain(x => x.Contestant.Id == _empireStrikesBack && x.Score == 4);
            result.Should().Contain(x => x.Contestant.Id == _aNewHope && x.Score == 3);
            result.Should().Contain(x => x.Contestant.Id == _revengeOfTheSith && x.Score == 0);
            result.Should().Contain(x => x.Contestant.Id == _attackOfTheClones && x.Score == 0);
            result.Should().Contain(x => x.Contestant.Id == _phantomMenace && x.Score == 0);
        }
    }
}