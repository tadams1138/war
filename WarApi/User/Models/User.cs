namespace WarApi.User.Models
{
    /// <summary>
    /// Contains information about the authenticated user.
    /// </summary>
    public class User
    {
        /// <summary>
        /// The user's name.
        /// </summary>
        public string Name { get; internal set; }
    }
}
