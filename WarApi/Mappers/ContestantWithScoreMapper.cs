using WarApi.Models;

namespace WarApi.Mappers
{
    class ContestantWithScoreMapper : ITypedMapper<War.RankingServices.ContestantWithScore, ContestantWithScore>
    {
        private readonly ITypedMapper<War.Contestant, Contestant> _contestantMapper;

        public ContestantWithScoreMapper(ITypedMapper<War.Contestant, Contestant> contestantMapper)
        {
            _contestantMapper = contestantMapper;
        }

        public ContestantWithScore Map(War.RankingServices.ContestantWithScore source)
        {
            var contestant = _contestantMapper.Map(source.Contestant);
            var target = new ContestantWithScore
            {
                Contestant = contestant,
                Score = source.Score
            };
            return target;
        }
    }
}
