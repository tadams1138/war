using System;
using System.Threading.Tasks;

namespace War.MatchFactories
{
    public class RandomMatchStrategy : IMatchFactory
    {
        private readonly IContestantRepository _contestantRepository;
        private readonly Func<int, int, int> _generateRandomNumber;
        private readonly IMatchRepository _matchRepository;

        public RandomMatchStrategy(IMatchRepository matchRepository, IContestantRepository contestantRepository)
            : this(matchRepository, contestantRepository, GenerateRandomNumber)
        {
        }
        
        internal RandomMatchStrategy(IMatchRepository matchRepository, IContestantRepository contestantRepository, Func<int, int, int> generateRandomNumber)
        {
            _matchRepository = matchRepository;
            _contestantRepository = contestantRepository;
            _generateRandomNumber = generateRandomNumber;
        }

        public async Task<MatchWithContestants> Create(int warId)
        {
            var contestantCount = await _contestantRepository.GetCount(warId);
            var upperLimit = contestantCount - 1;
            var contestant1Index = _generateRandomNumber(0, upperLimit);
            var contestant2Index = GetContestant2Index(contestantCount, upperLimit, contestant1Index);

            var contestant1 = await _contestantRepository.Get(warId, contestant1Index);
            var contestant2 = await _contestantRepository.Get(warId, contestant2Index);

            Guid matchId = await CreateMatch(warId, contestant1, contestant2);

            var result = new MatchWithContestants
            {
                Contestant1 = contestant1,
                Contestant2 = contestant2,
                Id = matchId
            };
            return result;
        }

        private int GetContestant2Index(int contestantCount, int upperLimit, int contestant1Index)
        {
            var contestant2Index = _generateRandomNumber(0, upperLimit);

            if (contestant1Index == contestant2Index)
            {
                contestant2Index++;
            }

            if (contestant2Index == contestantCount)
            {
                contestant2Index = 0;
            }

            return contestant2Index;
        }

        private async Task<Guid> CreateMatch(int warId, Contestant contestant1, Contestant contestant2)
        {
            var matchRequest = new MatchRequest
            {
                Contestant1 = contestant1.Id,
                Contestant2 = contestant2.Id
            };
            var matchId = await _matchRepository.Create(warId, matchRequest);
            return matchId;
        }

        private static int GenerateRandomNumber(int lowerBound, int upperBound)
        {
            var numberGenerator = new Random(DateTime.UtcNow.Millisecond);
            var randomNumber = numberGenerator.Next(lowerBound, upperBound);
            return randomNumber;
        }
    }
}
