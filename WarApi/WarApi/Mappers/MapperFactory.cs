using System;
using System.Security.Claims;
using War.Matches;
using War.Matches.Factories;
using War.RankingServices;
using War.Votes;

namespace WarApi.Mappers
{
    class MapperFactory
    {
        public ITypedMapper<S, T> Get<S, T>()
        {
            if (typeof(S) == typeof(ContestantWithScore) && typeof(T) == typeof(Models.ContestantWithScore))
            {
                var result = (ITypedMapper<S, T>)CreateContestantWithScoreMapper();
                return result;
            }
            else if (typeof(S) == typeof(MatchWithContestants) && typeof(T) == typeof(Models.Match))
            {
                var result = (ITypedMapper<S, T>)CreateMatchMapper();
                return result;
            }
            else if (typeof(S) == typeof(Models.VoteRequest) && typeof(T) == typeof(VoteRequest))
            {
                var result = (ITypedMapper<S, T>)CreateVoteRequestMapper();
                return result;
            }
            else if (typeof(S) == typeof(ClaimsPrincipal) && typeof(T) == typeof(War.Users.User))
            {
                var result = (ITypedMapper<S, T>)CreateClaimsPrincipalToWarUserMapper();
                return result;
            }
            else if (typeof(S) == typeof(ClaimsPrincipal) && typeof(T) == typeof(User.Models.User))
            {
                var result = (ITypedMapper<S, T>)CreateClaimsPrincipalToModelsUserMapper();
                return result;
            }
            else
            {
                throw new MapperNotDefinedException(typeof(S), typeof(T));
            }
        }

        private ClaimsPrincipalMapper CreateClaimsPrincipalToWarUserMapper()
        {
            var mapper = new ClaimsPrincipalMapper();
            return mapper;
        }

        private User.Mappers.ClaimsPrincipalMapper CreateClaimsPrincipalToModelsUserMapper()
        {
            var mapper = new User.Mappers.ClaimsPrincipalMapper();
            return mapper;
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
