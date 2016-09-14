namespace WarApi.Models
{
    public class ContestantSearchRequest
    {
        public bool OrderByScoreDesc { get; set; }
        public int Skip { get; set; }
        public int Take { get; set; }
    }
}
