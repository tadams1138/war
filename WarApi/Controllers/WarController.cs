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
        private readonly IMatchRepository _matchRepo;
        private readonly IRankingService _rankingService;
        private readonly IWarRepository _warRepo;

        public WarController(IMatchRepository matchRepo, IMapper mapper, IRankingService rankingService, IWarRepository warRepo)
        {
            _matchRepo = matchRepo;
            _mapper = mapper;
            _rankingService = rankingService;
            _warRepo = warRepo;
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

            var match = _matchRepo.Create(warId);
            var matchModel = _mapper.Map<Match>(match);
            return Ok(matchModel);
        }


        [Route("{warId}/UpdateVote")]
        [HttpPost]
        public IHttpActionResult UpdateVote(int warId, VoteRequest request)
        {
            if (request == null)
            {
                return BadRequest("Could not deserialize request.");
            }

            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            if (!IsValidWarId(warId))
            {
                return NotFound();
            }

            var voteRequest = _mapper.Map<War.VoteRequest>(request);
            _matchRepo.Update(voteRequest);
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
            var contestantModels = contestants.Select(c => _mapper.Map<ContestantWithScore>(c));
            return Ok(contestantModels);
        }

        private bool IsValidWarId(int warId)
        {
            return _warRepo.Get(warId) != null;
        }
    }
}
