using Newtonsoft.Json;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using War.Contestants.Sql;

namespace MovieWar.ContestantCreator
{
    public class FileContestantRequestFactory
    {
        public static ContestantRequest[] GetContestants()
        {
            ContestantRequest[] items = null;
            using (var r = new StreamReader("MovieContestants.json"))
            {
                string json = r.ReadToEnd();
                items = JsonConvert.DeserializeObject<ContestantRequest[]>(json);
            }

            return items;
        }

        public static async Task WriteMovieContestantsToFile(IEnumerable<ContestantRequest> contestants)
        {
            using (var w = new StreamWriter("MovieContestants.json"))
            {
                var json = JsonConvert.SerializeObject(contestants);
                await w.WriteAsync(json);
            }
        }
    }
}
