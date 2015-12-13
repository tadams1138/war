using System;
using System.ComponentModel.DataAnnotations;

namespace WarApi.Models
{
    public class VoteRequest
    {
        public Guid MatchId { get; set; }

        [Required]
        public VoteChoice? Choice { get; set; }
    }
}