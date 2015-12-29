using System;
using System.ComponentModel.DataAnnotations;

namespace WarApi.Models
{
    /// <summary>
    /// A vote submission following the creation of a match.
    /// </summary>
    public class VoteRequest
    {
        /// <summary>
        /// The match ID.
        /// </summary>
        public Guid MatchId { get; set; }

        /// <summary>
        /// The choice to win the match.
        /// </summary>
        // This is both "Required" and nullable so that the model binder
        // does not set the value to 0 by default. Rather the model binder might set the 
        // value to null if the value was not supplied in the request, and then the 
        // model validation will catch that the value was not supplied.
        [Required]
        public VoteChoice? Choice { get; set; }
    }
}