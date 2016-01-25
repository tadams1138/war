using System;
using War.Contestants;

namespace War.Matches.Factories
{
    public class MatchWithContestants
    {
        public Contestant Contestant1 { get; set; }
        public Contestant Contestant2 { get; set; }
        public Guid Id { get; set; }
    }
}
