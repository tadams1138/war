using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;
using System.Threading.Tasks;
using War.Contestants;
using War.Contestants.Sql;
using War.Sql.Contestants;

namespace CandidateWar2016
{
    [TestClass]
    public class ContestantsCreator
    {
        const string LastName = "LastName";
        const string FirstName = "FirstName";

        private static readonly ContestantRequest HillaryClinton = Create(
            "Hillary",
            "Clinton",
            "Democratic",
            "67th Secretary of State",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/HRC_in_Iowa_APR_2015.jpg/113px-HRC_in_Iowa_APR_2015.jpg",
            @"https://en.wikipedia.org/wiki/Hillary_Clinton",
            @"https://www.hillaryclinton.com/");

        private static readonly ContestantRequest MartinOMalley = Create(
            "Martin",
            "O'Malley",
            "Democratic",
            "61st Governor of Maryland",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Governor_O%27Malley_Portrait_%28cropped%29.jpg/108px-Governor_O%27Malley_Portrait_%28cropped%29.jpg",
            @"https://en.wikipedia.org/wiki/Martin_O%27Malley",
            @"http://martinomalley.com/");

        private static readonly ContestantRequest BernieSanders = Create(
            "Bernie",
            "Sanders",
            "Democratic",
            "U.S. Senator from Vermont",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Bernie_Sanders_September_2015_cropped.jpg/120px-Bernie_Sanders_September_2015_cropped.jpg",
            @"https://en.wikipedia.org/wiki/Bernie_Sanders",
            @"http://berniesanders.com/");

        private static readonly ContestantRequest JimWebb = Create(
            "Jim",
            "Webb",
            "Democratic",
            "Former U.S. Senator from Virginia",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Jim_Webb_2014_%2814055318738%29_%28cropped%29.jpg/79px-Jim_Webb_2014_%2814055318738%29_%28cropped%29.jpg",
            @"https://en.wikipedia.org/wiki/Jim_Webb",
            @"http://webb2016.com//");

        private static readonly ContestantRequest LincolnChafee = Create(
            "Lincoln",
            "Chafee",
            "Democratic",
            "Former Governor of Rhode Island",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Lincoln_Chafee_%2814290233225%29_%28cropped%29.jpg/77px-Lincoln_Chafee_%2814290233225%29_%28cropped%29.jpg",
            @"https://en.wikipedia.org/wiki/Lincoln_Chafee",
            @"http://www.chafee2016.com/");

        private static readonly ContestantRequest LawrenceLessig = Create(
            "Lawrence",
            "Lessig",
            "Democratic",
            "Harvard Law Professor",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Lessig_%28cropped%29.png/77px-Lessig_%28cropped%29.png",
            @"https://en.wikipedia.org/wiki/Lawrence_Lessig",
            @"https://lessig2016.us/");

        private static readonly ContestantRequest JebBush = Create(
            "Jeb",
            "Bush",
            "Republican",
            "43rd Governor of Florida",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Governor_of_Florida_Jeb_Bush_2015_in_NH_by_Michael_Vadon_%28cropped%29.jpg/103px-Governor_of_Florida_Jeb_Bush_2015_in_NH_by_Michael_Vadon_%28cropped%29.jpg",
            @"https://en.wikipedia.org/wiki/Jeb_Bush",
            @"https://www.jeb2016.com/");

        private static readonly ContestantRequest BenCarson = Create(
            "Ben",
            "Carson",
            "Republican",
            "Director of Pediatric Neurosurgery, Johns Hopkins Hospital",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Ben_Carson_by_Gage_Skidmore_6.jpg/121px-Ben_Carson_by_Gage_Skidmore_6.jpg",
            @"https://en.wikipedia.org/wiki/Ben_Carson",
            @"https://www.bencarson.com/");

        private static readonly ContestantRequest ChrisChristie = Create(
            "Chris",
            "Christie",
            "Republican",
            "55th Governor of New Jersey",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Chris_Christie_April_2015_%28cropped%29.jpg/115px-Chris_Christie_April_2015_%28cropped%29.jpg",
            @"https://en.wikipedia.org/wiki/Chris_Christie",
            @"https://www.chrischristie.com/");

        private static readonly ContestantRequest TedCruz = Create(
            "Ted",
            "Cruz",
            "Republican",
            "U.S. Senator from Texas",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Ted_Cruz%2C_official_portrait%2C_113th_Congress_%28cropped_2%29.jpg/110px-Ted_Cruz%2C_official_portrait%2C_113th_Congress_%28cropped_2%29.jpg",
            @"https://en.wikipedia.org/wiki/Ted_Cruz",
            @"https://www.tedcruz.org/");

        private static readonly ContestantRequest CarlyFiorina = Create(
            "Carly",
            "Fiorina",
            "Republican",
            "CEO of Hewlett-Packard",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Carly_Fiorina_%2816991338093%29_%28cropped%29.jpg/126px-Carly_Fiorina_%2816991338093%29_%28cropped%29.jpg",
            @"https://en.wikipedia.org/wiki/Carly_Fiorina",
            @"https://carlyforpresident.com/");

        private static readonly ContestantRequest JimGilmore = Create(
            "Jim",
            "Gilmore",
            "Republican",
            "68th Governor of Virginia",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Jim_Gilmore_2015.jpg/108px-Jim_Gilmore_2015.jpg",
            @"https://en.wikipedia.org/wiki/Jim_Gilmore",
            @"http://www.gilmoreforamerica.com/");

        private static readonly ContestantRequest MikeHuckabee = Create(
            "Mike",
            "Huckabee",
            "Republican",
            "44th Governor of Arkansas",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Mike_Huckabee_by_Gage_Skidmore_6.jpg/122px-Mike_Huckabee_by_Gage_Skidmore_6.jpg",
            @"https://en.wikipedia.org/wiki/Mike_Huckabee",
            @"http://www.mikehuckabee.com/");

        private static readonly ContestantRequest JohnKasich = Create(
            "John",
            "Kasich",
            "Republican",
            "69th Governor of Ohio",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Governor_John_Kasich.jpg/114px-Governor_John_Kasich.jpg",
            @"https://en.wikipedia.org/wiki/John_Kasich",
            @"http://www.johnkasich.com/");

        private static readonly ContestantRequest GeorgePataki = Create(
            "George",
            "Pataki",
            "Republican",
            "53rd Governor of New York",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/George_Pataki_at_Franklin_Pierce_University.jpg/125px-George_Pataki_at_Franklin_Pierce_University.jpg",
            @"https://en.wikipedia.org/wiki/George_Pataki",
            @"http://www.georgepataki.com/");

        private static readonly ContestantRequest RandPaul = Create(
            "Rand",
            "Paul",
            "Republican",
            "U.S. Senator from Kentucky",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Rand_Paul%2C_official_portrait%2C_112th_Congress.jpg/126px-Rand_Paul%2C_official_portrait%2C_112th_Congress.jpg",
            @"https://en.wikipedia.org/wiki/Rand_Paul",
            @"http://www.randpaul.com/");

        private static readonly ContestantRequest MarcoRubio = Create(
            "Marco",
            "Rubio",
            "Republican",
            "U.S. Senator from Florida",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Marco_Rubio%2C_Official_Portrait%2C_112th_Congress.jpg/126px-Marco_Rubio%2C_Official_Portrait%2C_112th_Congress.jpg",
            @"https://en.wikipedia.org/wiki/Marco_Rubio",
            @"https://marcorubio.com/");

        private static readonly ContestantRequest RickSantorum = Create(
            "Rick",
            "Santorum",
            "Republican",
            "U.S. Senator from Pennsylvania",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Rick_Santorum_by_Gage_Skidmore_8_%28cropped2%29.jpg/119px-Rick_Santorum_by_Gage_Skidmore_8_%28cropped2%29.jpg",
            @"https://en.wikipedia.org/wiki/Rick_Santorum",
            @"http://ricksantorum.com/");

        private static readonly ContestantRequest DonaldTrump = Create(
            "Donald",
            "Trump",
            "Republican",
            "Chairman of The Trump Organization",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Donald_August_19_%28cropped%29.jpg/118px-Donald_August_19_%28cropped%29.jpg",
            @"https://en.wikipedia.org/wiki/Donald_Trump",
            @"https://www.donaldjtrump.com/");

        private static readonly ContestantRequest RickPerry = Create(
            "Rick",
            "Perry",
            "Republican",
            "Former Governor of Texas",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Rick_Perry_%2816676564411%29_%28cropped1%29.jpg/85px-Rick_Perry_%2816676564411%29_%28cropped1%29.jpg",
            @"https://en.wikipedia.org/wiki/Rick_Perry",
            @"http://www.rickperry.org/");

        private static readonly ContestantRequest ScottWalker = Create(
            "Scott",
            "Walker",
            "Republican",
            "Governor of Wisconsin",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Scott_Walker_February_2015.jpg/82px-Scott_Walker_February_2015.jpg",
            @"https://en.wikipedia.org/wiki/Scott_Walker",
            @"http://www.scottwalker.com/");

        private static readonly ContestantRequest MarkEverson = Create(
            "Mark",
            "Everson",
            "Republican",
            "Former Commissioner of Mississippi",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/MarkEverson.jpg/94px-MarkEverson.jpg",
            @"https://en.wikipedia.org/wiki/Mark_Everson",
            @"http://markforamerica.com/");

        private static readonly ContestantRequest BobbyJindal = Create(
            "Bobby",
            "Jindal",
            "Republican",
            "Governor of Louisiana",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Bobby_Jindal_26_February_2015.jpg/95px-Bobby_Jindal_26_February_2015.jpg",
            @"https://en.wikipedia.org/wiki/Bobby_Jindal",
            @"http://www.bobbyjindal.com/");

        private static readonly ContestantRequest LindseyGraham = Create(
            "Lindsey",
            "Graham",
            "Republican",
            "U.S. Senator of South Carolina",
            @"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Lindsey_Graham%2C_official_Senate_photo_portrait_cropped.jpg/95px-Lindsey_Graham%2C_official_Senate_photo_portrait_cropped.jpg",
            @"https://en.wikipedia.org/wiki/Lindsey_Graham",
            @"http://www.lindseygraham.com/");

        private static ContestantRequest Create(string firstName, string lastName, string party, string occupation, string wikipediaImageUrl, string wikipediaUrl, string campaignUrl)
        {
            const string Party = "Party";
            const string Occupation = "Occupation";
            const string WikipediaImageUrl = "WikipediaImageUrl";
            const string CampaignUrl = "CampaignUrl";
            const string WikipediaUrl = "WikipediaUrl";

            return new ContestantRequest
            {
                Definition = new Dictionary<string, string>
                {
                    { FirstName, firstName },
                    { LastName, lastName },
                    { Party, party },
                    { Occupation, occupation },
                    { WikipediaImageUrl, wikipediaImageUrl },
                    { CampaignUrl, campaignUrl },
                    { WikipediaUrl, wikipediaUrl }
                }
            };
        }

        private ContestantRequest[] contestants = new[] {
            HillaryClinton,
            MartinOMalley,
            BernieSanders,
            JimWebb,
            LincolnChafee,
            LawrenceLessig,
            JebBush,
            BenCarson,
            ChrisChristie,
            TedCruz,
            CarlyFiorina,
            JimGilmore,
            MikeHuckabee,
            JohnKasich,
            GeorgePataki,
            RandPaul,
            MarcoRubio,
            RickSantorum,
            DonaldTrump,
            RickPerry,
            ScottWalker,
            MarkEverson,
            BobbyJindal,
            LindseyGraham
        };

        [Ignore]
        [TestMethod]
        public async Task SyncContestants()
        {
            var sqlServerConnectionString = System.Configuration.ConfigurationManager.ConnectionStrings["WarDb"].ConnectionString;
            var synchronizer = new ContestantSynchronizer();
            await synchronizer.SyncContestants(sqlServerConnectionString, contestants, 2, "Presidential Candidate War 2016", IsTheSame);
        }

        private static bool IsTheSame(Contestant c1, ContestantRequest c2)
        {
            return c2.Definition[LastName] == c1.Definition[LastName] && c2.Definition[FirstName] == c1.Definition[FirstName];
        }
    }
}
