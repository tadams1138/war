using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using War.Contestants;
using War.Matches;
using War.Votes;

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
        public async Task GivenMatches_GetRankings_ReturnsExpectedRankings()
        {
            // Arrange
            int warId = 1234;
            var stubMatchRepo = new Mock<IMatchRepository>();
            var stubContestantRepo = new Mock<IContestantRepository>();
            var stubVoteRepo = new Mock<IVoteRepository>();
            var matches = new List<Matches.Match> {
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _aNewHope, Contestant2 = _returnOfTheJedi },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _returnOfTheJedi, Contestant2 = _empireStrikesBack },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _phantomMenace, Contestant2 = _returnOfTheJedi },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _returnOfTheJedi, Contestant2 = _attackOfTheClones },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _returnOfTheJedi, Contestant2 = _revengeOfTheSith },

                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _aNewHope, Contestant2 = _empireStrikesBack },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _revengeOfTheSith, Contestant2 = _empireStrikesBack },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _phantomMenace, Contestant2 = _empireStrikesBack },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _attackOfTheClones, Contestant2 = _empireStrikesBack },

                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _aNewHope, Contestant2 = _phantomMenace },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _aNewHope, Contestant2 = _attackOfTheClones },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _aNewHope, Contestant2 = _revengeOfTheSith },

                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _revengeOfTheSith, Contestant2 = _phantomMenace },
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _attackOfTheClones, Contestant2 = _revengeOfTheSith },

                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _attackOfTheClones, Contestant2 = _phantomMenace },

                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _returnOfTheJedi, Contestant2 = _empireStrikesBack }, // Duplicate
                new Matches.Match { Id = Guid.NewGuid(), Contestant1 = _empireStrikesBack, Contestant2 = _returnOfTheJedi }, // Inverted Order Duplicate
            };

            var votes = new List<Vote>
            {
                new Vote { MatchId = matches[0].Id,  Choice = VoteChoice.Contestant2Won },
                new Vote { MatchId = matches[1].Id,  Choice = VoteChoice.Contestant1Won },
                new Vote { MatchId = matches[2].Id,  Choice = VoteChoice.Contestant2Won },
                new Vote { MatchId = matches[3].Id,  Choice = VoteChoice.Contestant1Won },
                new Vote { MatchId = matches[4].Id,  Choice = VoteChoice.Contestant1Won },

                new Vote { MatchId = matches[5].Id,  Choice = VoteChoice.Contestant2Won },
                new Vote { MatchId = matches[6].Id,  Choice = VoteChoice.Contestant2Won },
                new Vote { MatchId = matches[7].Id,  Choice = VoteChoice.Contestant2Won },
                new Vote { MatchId = matches[8].Id,  Choice = VoteChoice.Contestant2Won },

                new Vote { MatchId = matches[9].Id,  Choice = VoteChoice.Contestant1Won },
                new Vote { MatchId = matches[10].Id,  Choice = VoteChoice.Contestant1Won },
                new Vote { MatchId = matches[11].Id,  Choice = VoteChoice.Contestant1Won },

                new Vote { MatchId = matches[12].Id,  Choice = VoteChoice.Pass },
                new Vote { MatchId = matches[13].Id,  Choice = VoteChoice.Pass },
                    
                //new Votes.Vote { MatchId = matches[14].Id, Result = VoteChoice.None },
                    
                new Vote { MatchId = matches[15].Id,  Choice = VoteChoice.Contestant1Won }, // Duplicate
                new Vote { MatchId = matches[16].Id, Choice = VoteChoice.Contestant2Won }, // Inverted Order Duplicate
            };

            var contestants = new List<Contestant> {
                new Contestant { Id = _aNewHope },
                new Contestant { Id = _empireStrikesBack } ,
                new Contestant { Id = _returnOfTheJedi } ,
                new Contestant { Id = _phantomMenace } ,
                new Contestant { Id = _attackOfTheClones } ,
                new Contestant { Id = _revengeOfTheSith } };
            stubContestantRepo.Setup(x => x.GetAll(warId)).Returns(Task.FromResult<IEnumerable<Contestant>>(contestants));
            stubMatchRepo.Setup(x => x.GetAll(warId)).Returns(Task.FromResult((IEnumerable<Matches.Match>)matches));
            stubVoteRepo.Setup(x => x.GetAll(warId)).ReturnsAsync(votes);
            var service = new SumDistinctWinsRankingStrategy(stubMatchRepo.Object, stubContestantRepo.Object, stubVoteRepo.Object);

            // Act
            var result = await service.GetRankings(warId);

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