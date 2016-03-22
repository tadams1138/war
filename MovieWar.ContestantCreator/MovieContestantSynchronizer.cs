using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using System.IO;
using System.Threading.Tasks;
using War.Contestants;
using War.Contestants.Sql;
using War.Sql.Contestants;

namespace MovieWar.ContestantCreator
{
    [TestClass]
    public class MovieContestantSynchronizer
    {
        const string ImdbId = "imdbID";

        [Ignore]
        [TestMethod]
        public async Task SyncContestants()
        {
            var contestants = FileContestantRequestFactory.GetContestants();
            var sqlServerConnectionString = System.Configuration.ConfigurationManager.ConnectionStrings["WarDb"].ConnectionString;
            var synchronizer = new ContestantSynchronizer();
            await synchronizer.SyncContestants(sqlServerConnectionString, contestants, 1, "Movie War", IsTheSame);
        }

        private static bool IsTheSame(Contestant c1, ContestantRequest c2)
        {
            return c2.Definition[ImdbId] == c1.Definition[ImdbId];
        }
    }
}
