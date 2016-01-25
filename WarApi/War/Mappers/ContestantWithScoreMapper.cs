using War.Contestants;
using War.RankingServices;

namespace WarApi.Mappers
{
    class ContestantWithScoreMapper : ITypedMapper<ContestantWithScore, Models.ContestantWithScore>
    {
        private readonly ITypedMapper<Contestant, Models.Contestant> _contestantMapper;

        public ContestantWithScoreMapper(ITypedMapper<Contestant, Models.Contestant> contestantMapper)
        {
            _contestantMapper = contestantMapper;
        }

        public Models.ContestantWithScore Map(ContestantWithScore source)
        {
            var contestant = _contestantMapper.Map(source.Contestant);
            var target = new Models.ContestantWithScore
            {
                Contestant = contestant,
                Score = source.Score
            };
            return target;
        }
    }
}
