using System.Collections.Generic;
using System.Linq;
using System.Web.Http;
using System.Web.Http.Description;
using War;
using War.RankingServices;
using WarApi.Mappers;

namespace WarApi.Controllers
{
    [RoutePrefix("api/War")]
    public class WarController : ApiController
    {
        private readonly IMapper _mapper;
        private readonly IRankingService _rankingService;
        private readonly IWarRepository _warRepo;
        private readonly IMatchFactory _matchFactory;
        private readonly IMatchRepository _matchRepository;

        public WarController(IMapper mapper, IRankingService rankingService, IWarRepository warRepo, IMatchFactory matchFactory, IMatchRepository matchRepository)
        {
            _mapper = mapper;
            _rankingService = rankingService;
            _warRepo = warRepo;
            _matchFactory = matchFactory;
            _matchRepository = matchRepository;
        }

        [Route("{warId}/CreateMatch")]
        [HttpPost]
        [ResponseType(typeof(Match))]
        public IHttpActionResult CreateMatch(int warId)
        {
            if (!IsValidWarId(warId))
            {
                return NotFound();
            }

            var match = _matchFactory.Create(warId);
            var matchModel = _mapper.Map<MatchWithContestants, Models.Match>(match);
            return Ok(matchModel);
        }


        [Route("{warId}/Vote")]
        [HttpPost]
        public IHttpActionResult Vote(int warId, Models.VoteRequest request)
        {
            if (request == null)
            {
                return BadRequest("Could not deserialize request.");
            }

            if (!IsValidWarId(warId))
            {
                return NotFound();
            }

            var existingMatch = _matchRepository.Get(request.MatchId);
            if (existingMatch == null)
            {
                ModelState.AddModelError($"{nameof(request.MatchId)}", $"'{request.MatchId}' is not valid.");
            }

            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            if (existingMatch.Result != VoteChoice.None)
            {
                ModelState.AddModelError($"{nameof(request.MatchId)}", "Match is already assigned a vote.");
                return BadRequest(ModelState);
            }

            var voteRequest = _mapper.Map<Models.VoteRequest, VoteRequest>(request);
            _matchRepository.Update(voteRequest);
            return StatusCode(System.Net.HttpStatusCode.NoContent);
        }

        [Route("{warId}/Contestants")]
        [ResponseType(typeof(IEnumerable<ContestantWithScore>))]
        [HttpGet]
        public IHttpActionResult GetContestants(int warId)
        {
            if (!IsValidWarId(warId))
            {
                return NotFound();
            }

            var contestants = _rankingService.GetRankings(warId);
            var contestantModels = contestants.Select(c => _mapper.Map<War.RankingServices.ContestantWithScore, ContestantWithScore>(c));
            return Ok(contestantModels);
        }

        private bool IsValidWarId(int warId)
        {
            return _warRepo.Get(warId) != null;
        }
    }
}
