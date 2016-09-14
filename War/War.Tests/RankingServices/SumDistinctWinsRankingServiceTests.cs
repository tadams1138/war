using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using War.Contestants;
using War.Matches;
using War.Votes;

namespace War.RankingServices
{
    [TestClass()]
    public class SumDistinctWinsRankingServiceTests
    {
        private SumDistinctWinsRankingStrategy service;
        private Mock<IContestantRepository> _stubContestantRepo;
        private Mock<IMatchRepository> _stubMatchRepo;
        private Mock<IVoteRepository> _stubVoteRepo;
        const int WarId = 1234;

        [TestInitialize]
        public void InitializeTests()
        {
            _stubContestantRepo = new Mock<IContestantRepository>();
            _stubMatchRepo = new Mock<IMatchRepository>();
            _stubVoteRepo = new Mock<IVoteRepository>();
            service = new SumDistinctWinsRankingStrategy(_stubMatchRepo.Object, _stubContestantRepo.Object, _stubVoteRepo.Object);
        }

        [TestMethod()]
        public async Task GivenMatches_GetRankings_ReturnsExpectedRankings()
        {
            // Arrange
            var _aNewHope = Guid.NewGuid();
            var _empireStrikesBack = Guid.NewGuid();
            var _returnOfTheJedi = Guid.NewGuid();
            var _phantomMenace = Guid.NewGuid();
            var _attackOfTheClones = Guid.NewGuid();
            var _revengeOfTheSith = Guid.NewGuid();

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
            _stubContestantRepo.Setup(x => x.GetAll(WarId)).Returns(Task.FromResult<IEnumerable<Contestant>>(contestants));
            _stubMatchRepo.Setup(x => x.GetAll(WarId)).Returns(Task.FromResult((IEnumerable<Matches.Match>)matches));
            _stubVoteRepo.Setup(x => x.GetAll(WarId)).ReturnsAsync(votes);

            // Act
            var result = await service.GetRankings(WarId);

            // Assert
            result.Should().Contain(x => x.Contestant.Id == _returnOfTheJedi && x.Score == 7);
            result.Should().Contain(x => x.Contestant.Id == _empireStrikesBack && x.Score == 4);
            result.Should().Contain(x => x.Contestant.Id == _aNewHope && x.Score == 3);
            result.Should().Contain(x => x.Contestant.Id == _revengeOfTheSith && x.Score == 0);
            result.Should().Contain(x => x.Contestant.Id == _attackOfTheClones && x.Score == 0);
            result.Should().Contain(x => x.Contestant.Id == _phantomMenace && x.Score == 0);
        }

        [TestMethod]
        public async Task GetRankings_LoadTest()
        {
            // Arrange
            List<Contestant> contestants = CreateTestContestants(24);
            List<Matches.Match> matches = CreateTestMatches(contestants, 1000000);
            List<Vote> votes = CreateTestVotes(matches);
            _stubContestantRepo.Setup(x => x.GetAll(WarId)).ReturnsAsync(contestants);
            _stubMatchRepo.Setup(x => x.GetAll(WarId)).ReturnsAsync(matches);
            _stubVoteRepo.Setup(x => x.GetAll(WarId)).ReturnsAsync(votes);
            var stopWatch = new Stopwatch();

            // Act
            stopWatch.Start();
            var results = await service.GetRankings(WarId);
            foreach (var c in results)
            {
                Console.WriteLine($"{c.Contestant.Id} {c.Score}");
            }
            stopWatch.Stop();
            Console.WriteLine($"ElapsedMilliseconds = {stopWatch.ElapsedMilliseconds}");

            // Assert
            stopWatch.ElapsedMilliseconds.Should().BeLessThan(3000);
        }

        private static List<Vote> CreateTestVotes(List<Matches.Match> matches)
        {
            var votes = new List<Vote>();
            var count = 0;
            foreach (var m in matches)
            {
                var vote = new Vote { MatchId = m.Id, Choice = (VoteChoice)(count % 3) };
                votes.Add(vote);
                count++;
            }

            return votes;
        }

        private static List<Matches.Match> CreateTestMatches(List<Contestant> contestants, int count)
        {
            var matches = new List<Matches.Match>();
            var contestantCount = contestants.Count;
            for (var i = 0; i < count; i++)
            {
                var contestant = contestants[i % contestantCount];
                var match = new Matches.Match { Id = Guid.NewGuid(), Contestant1 = contestant.Id, Contestant2 = contestant.Id };
                matches.Add(match);
            }

            return matches;
        }

        private static List<Contestant> CreateTestContestants(int count)
        {
            var contestants = new List<Contestant>();
            for (var i = 0; i < count - 1; i++)
            {
                var contestant = new Contestant { Id = Guid.NewGuid() };
                contestants.Add(contestant);
            }

            return contestants;
        }
    }
}