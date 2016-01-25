namespace WarApi.Models
{
    /// <summary>
    /// A contestant paired with their score in this war.
    /// </summary>
    public class ContestantWithScore
    {
        /// <summary>
        /// A contestant.
        /// </summary>
        public Contestant Contestant { get; internal set; }

        /// <summary>
        /// The score associated with the contestant.
        /// </summary>
        public int Score { get; internal set; }
    }
}