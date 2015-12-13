using System;

namespace WarApi.Models
{
    public class Match
    {
        public object Id { get; internal set; }
        public Guid MatchId { get; set; }

        public Contestant Contestant1 { get; set; }

        public Contestant Contestant2 { get; set; }
    }
}