using System;
using System.Threading.Tasks;

namespace War.MatchFactories
{
    public class RandomMatchStrategy : IMatchFactory
    {
        private readonly IContestantRepository _contestantRepository;
        private readonly Func<int, int, int> _generateRandomNumber;
        private readonly IMatchRepository _matchRepository;
        private static readonly Random numberGenerator = new Random(DateTime.UtcNow.Millisecond);

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

        public async Task<MatchWithContestants> Create(int warId, UserIdentifier userId)
        {
            var contestantCount = await _contestantRepository.GetCount(warId);
            var contestant1Index = _generateRandomNumber(0, contestantCount);
            var contestant2Index = GetContestant2Index(contestantCount, contestant1Index);

            var contestant1 = await _contestantRepository.Get(warId, contestant1Index);
            var contestant2 = await _contestantRepository.Get(warId, contestant2Index);

            Guid matchId = await CreateMatch(warId, contestant1, contestant2, userId);

            var result = new MatchWithContestants
            {
                Contestant1 = contestant1,
                Contestant2 = contestant2,
                Id = matchId
            };
            return result;
        }

        private int GetContestant2Index(int contestantCount, int contestant1Index)
        {
            var contestant2Index = _generateRandomNumber(0, contestantCount - 1);

            if (contestant1Index == contestant2Index)
            {
                contestant2Index = contestantCount - 1;
            }

            return contestant2Index;
        }

        private async Task<Guid> CreateMatch(int warId, Contestant contestant1, Contestant contestant2, UserIdentifier userId)
        {
            var matchRequest = new MatchRequest
            {
                Contestant1 = contestant1.Id,
                Contestant2 = contestant2.Id,
                UserIdentifier = userId
            };
            var matchId = await _matchRepository.Create(warId, matchRequest);
            return matchId;
        }

        private static int GenerateRandomNumber(int lowerBound, int upperBound)
        {
            var randomNumber = numberGenerator.Next(lowerBound, upperBound);
            return randomNumber;
        }
    }
}
