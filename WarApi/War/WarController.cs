using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Web.Http;
using System.Web.Http.Description;
using War.RankingServices;
using WarApi.Mappers;
using System.Security.Claims;
using System.Web.Http.Cors;
using War.Users;
using War.Wars;
using War.Matches.Factories;
using War.Matches;
using War.Contestants;

namespace WarApi
{
    /// <summary>
    /// War endpoints let you vote on a pair and view the rankings.
    /// </summary>
    [EnableCors(origins: "*", headers: "*", methods: "*", SupportsCredentials = true)]
    [RoutePrefix("api/War")]
    [Authorize]
    public class WarController : ApiController
    {
        private readonly IMapper _mapper;
        private readonly IRankingService _rankingService;
        private readonly IWarRepository _warRepo;
        private readonly IMatchFactory _matchFactory;
        private readonly IMatchRepository _matchRepository;
        private readonly IContestantRepository _contestantRepository;
        private readonly IUserRepository _userRepository;

        public WarController(IMapper mapper, IRankingService rankingService, IWarRepository warRepo, IMatchFactory matchFactory, IMatchRepository matchRepository, IContestantRepository contestantRepository, IUserRepository userRepository)
        {
            _mapper = mapper;
            _rankingService = rankingService;
            _warRepo = warRepo;
            _matchFactory = matchFactory;
            _matchRepository = matchRepository;
            _contestantRepository = contestantRepository;
            _userRepository = userRepository;
        }

        /// <summary>
        /// Create a pair to compare.
        /// </summary>
        /// <param name="warId">The War ID.</param>
        /// <returns>Two contestants and a match ID so that you can select the winner of this match by submitting your 
        /// choice to the Vote endpoint.</returns>
        [Route("{warId}/CreateMatch")]
        [HttpPost]
        [HttpGet]
        [ResponseType(typeof(Models.Match))]
        public async Task<IHttpActionResult> CreateMatch(int warId)
        {
            if (!await IsValidWarId(warId))
            {
                return NotFound();
            }

            if (await _contestantRepository.GetCount(warId) < 2)
            {
                return Conflict();
            }

            var user = _mapper.Map<ClaimsPrincipal, War.Users.User>(User as ClaimsPrincipal);
            await _userRepository.Upsert(user);

            var match = await _matchFactory.Create(warId, user.Id);
            var matchModel = _mapper.Map<MatchWithContestants, Models.Match>(match);
            return Created("", matchModel);
        }

        /// <summary>
        /// Submit your choice of a match to this endpoint.
        /// </summary>
        /// <param name="warId">The War ID.</param>
        /// <param name="request">The vote choice made from the match given by the CreateMatch endpoint.</param>
        /// <returns>No content.</returns>
        [Route("{warId}/Vote")]
        [HttpPost]
        [HttpPut]
        public async Task<IHttpActionResult> Vote(int warId, Models.VoteRequest request)
        {
            if (request == null)
            {
                return BadRequest("Could not deserialize request.");
            }

            if (!await IsValidWarId(warId))
            {
                return NotFound();
            }

            var existingMatch = await _matchRepository.Get(warId, request.MatchId);

            ValidateModel(request, existingMatch);
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var user = _mapper.Map<ClaimsPrincipal, War.Users.User>(User as ClaimsPrincipal);
            if (!IsUserWhoCreatedMatch(existingMatch, user))
            {
                return Unauthorized();
            }

            if (existingMatch.Result != VoteChoice.None)
            {
                return Conflict();
            }

            var voteRequest = _mapper.Map<Models.VoteRequest, VoteRequest>(request);
            await _matchRepository.Update(warId, voteRequest);
            return StatusCode(System.Net.HttpStatusCode.NoContent);
        }

        /// <summary>
        /// Gets a list of all contestants and their associated scores.
        /// </summary>
        /// <param name="warId">The War ID.</param>
        /// <returns>A list of contestants paired with their scores.</returns>
        [Route("{warId}/Contestants")]
        [ResponseType(typeof(IEnumerable<Models.ContestantWithScore>))]
        [HttpGet]
        public async Task<IHttpActionResult> GetContestants(int warId)
        {
            if (!await IsValidWarId(warId))
            {
                return NotFound();
            }

            var contestants = await _rankingService.GetRankings(warId);
            var contestantModels = contestants.Select(c => _mapper.Map<ContestantWithScore, Models.ContestantWithScore>(c));
            return Ok(contestantModels);
        }

        private static bool IsUserWhoCreatedMatch(Match existingMatch, War.Users.User user)
        {
            return existingMatch.UserId.AuthenticationType == user.Id.AuthenticationType
                            && existingMatch.UserId.NameIdentifier == user.Id.NameIdentifier;
        }

        private void ValidateModel(Models.VoteRequest request, Match existingMatch)
        {
            if (existingMatch == null)
            {
                ModelState.AddModelError($"{nameof(request.MatchId)}", $"'{request.MatchId}' is not valid.");
            }
        }

        private async Task<bool> IsValidWarId(int warId)
        {
            return await _warRepo.Get(warId) != null;
        }
    }
}
