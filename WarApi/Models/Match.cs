using System;

namespace WarApi.Models
{
    public class Match
    {
        public Contestant Contestant1 { get; set; }

        public Contestant Contestant2 { get; set; }

        public Guid Id { get; internal set; }
    }
}