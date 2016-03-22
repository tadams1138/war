using Newtonsoft.Json;
using System.IO;
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
    }
}
