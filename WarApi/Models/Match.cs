using System;

namespace WarApi.Models
{
    /// <summary>
    /// A pair of contestants to be compared and a winner to be chosen.
    /// </summary>
    public class Match
    {
        /// <summary>
        /// The first contestant.
        /// </summary>
        public Contestant Contestant1 { get; set; }

        /// <summary>
        /// The second contestant.
        /// </summary>
        public Contestant Contestant2 { get; set; }

        /// <summary>
        /// The ID for this match.
        /// </summary>
        public Guid Id { get; internal set; }
    }
}