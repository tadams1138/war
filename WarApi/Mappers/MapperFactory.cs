using System;

namespace WarApi.Mappers
{
    class MapperFactory
    {
        public ITypedMapper<S, T> Get<S, T>()
        {
            if (typeof(S) == typeof(War.RankingServices.ContestantWithScore) && typeof(T) == typeof(Models.ContestantWithScore))
            {
                var result = (ITypedMapper < S, T> )CreateContestantWithScoreMapper();
                return result;
            }
            else if (typeof(S) == typeof(War.MatchFactories.MatchWithContestants) && typeof(T) == typeof(Models.Match))
            {
                var result = (ITypedMapper<S, T>)CreateMatchMapper();
                return result;
            }
            else if (typeof(S) == typeof(Models.VoteRequest) && typeof(T) == typeof(War.VoteRequest))
            {
                var result = (ITypedMapper<S, T>)CreateVoteRequestMapper();
                return result;
            }
            else
            {
                throw new MapperNotDefinedException(typeof(S), typeof(T));
            }
        }

        private VoteRequestMapper CreateVoteRequestMapper()
        {
            var mapper = new VoteRequestMapper();
            return mapper;
        }

        private static MatchMapper CreateMatchMapper()
        {
            var contestantMapper = new ContestantMapper();
            var matchMapper = new MatchMapper(contestantMapper);
            return matchMapper;
        }

        private static ContestantWithScoreMapper CreateContestantWithScoreMapper()
        {
            var contestantMapper = new ContestantMapper();
            var contestantWithScoreMapper = new ContestantWithScoreMapper(contestantMapper);
            return contestantWithScoreMapper;
        }

        public class MapperNotDefinedException : Exception
        {
            public MapperNotDefinedException(Type source, Type target) : base($"No mapper defined from {source} to {target}")
            {
            }
        }
    }
}
