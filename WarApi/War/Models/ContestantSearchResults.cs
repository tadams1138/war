using System.Collections.Generic;

namespace WarApi.Models
{
    public class ContestantSearchResults
    {
        public IEnumerable<ContestantWithScore> Content { get; set; }

        public int Count { get; set; }

        public int Take { get; set; }

        public int Skip { get; set; }
    }
}
