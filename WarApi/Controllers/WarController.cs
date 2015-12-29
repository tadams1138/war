using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Web.Http;
using System.Web.Http.Cors;
using System.Web.Http.Description;
using War;
using War.MatchFactories;
using War.RankingServices;
using WarApi.Mappers;

namespace WarApi.Controllers
{
    [RoutePrefix("api/War")]
    //[Authorize]
    [EnableCors(origins: "https://candidatewar2016test.azurewebsites.net", headers: "*", methods: "*", SupportsCredentials = true)]
    public class WarController : ApiController
    {
        private readonly IMapper _mapper;
        private readonly IRankingService _rankingService;
        private readonly IWarRepository _warRepo;
        private readonly IMatchFactory _matchFactory;
        private readonly IMatchRepository _matchRepository;
        private readonly IContestantRepository _contestantRepository;

        public WarController(IMapper mapper, IRankingService rankingService, IWarRepository warRepo, IMatchFactory matchFactory, IMatchRepository matchRepository, IContestantRepository contestantRepository)
        {
            _mapper = mapper;
            _rankingService = rankingService;
            _warRepo = warRepo;
            _matchFactory = matchFactory;
            _matchRepository = matchRepository;
            _contestantRepository = contestantRepository;
        }

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

            var match = await _matchFactory.Create(warId);
            var matchModel = _mapper.Map<MatchWithContestants, Models.Match>(match);
            return Created("", matchModel);
        }

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

            await ValidateRequest(warId, request);

            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var voteRequest = _mapper.Map<Models.VoteRequest, VoteRequest>(request);
            await _matchRepository.Update(warId, voteRequest);
            return StatusCode(System.Net.HttpStatusCode.NoContent);
        }

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

        private async Task ValidateRequest(int warId, Models.VoteRequest request)
        {
            var existingMatch = await _matchRepository.Get(warId, request.MatchId);
            if (existingMatch == null)
            {
                ModelState.AddModelError($"{nameof(request.MatchId)}", $"'{request.MatchId}' is not valid.");
            }
            else if (existingMatch.Result != VoteChoice.None)
            {
                ModelState.AddModelError($"{nameof(request.MatchId)}", "Match is already assigned a vote.");
            }
        }

        private async Task<bool> IsValidWarId(int warId)
        {
            return await _warRepo.Get(warId) != null;
        }
    }
}
