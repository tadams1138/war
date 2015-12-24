using CandidateWar2016.Properties;
using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using War.Sql;

namespace CandidateWar2016
{
    [TestClass]
    public class ContestantsCreator
    {
        const int WarId = 2;
        private const string lastNameKey = "LastName";
        private const string firstNameKey = "FirstName";
        private ContestantRequest[] contestants = new[] {
            new ContestantRequest { Definition = new Dictionary<string, string> {
                { lastNameKey, "Rubio" }, { firstNameKey, "Marco" }
            } }
        };

        [TestMethod]
        
        public async Task SyncContestants()
        {
            await VerifyThatTheWarIdIsCorrect();

            var repository = new ContestantRepository(Settings.Default.WarDb);
            var existingContestants = await repository.GetAll(WarId);

            await UpdateExistingCandidates(repository, existingContestants, contestants);
            await InsertNewCandidates(repository, existingContestants, contestants);
        }

        private static async Task UpdateExistingCandidates(ContestantRepository repository, IEnumerable<War.Contestant> existingContestants, ContestantRequest[] contestants)
        {
            var updates = contestants.Where(c1 => existingContestants.Any(c2 => IsTheSame(c2, c1)))
                                    .Select(c => new War.Contestant
                                    {
                                        Definition = c.Definition,
                                        Id = existingContestants.Single(c1 => contestants.Any(c2 => IsTheSame(c1, c2))).Id
                                    });
            var tasks = new List<Task>();
            foreach (var c in updates)
            {
                var task = repository.Update(WarId, c);
                tasks.Add(task);
            }
            await Task.WhenAll(tasks);
        }

        private static async Task InsertNewCandidates(ContestantRepository repository, IEnumerable<War.Contestant> existingContestants, ContestantRequest[] contestants)
        {
            var additions = contestants.Where(c1 => !existingContestants.Any(c2 => IsTheSame(c2, c1)));

            var tasks = new List<Task>();
            foreach (var c in additions)
            {
                var task = repository.Create(WarId, c);
                tasks.Add(task);
            }
            await Task.WhenAll(tasks);
        }

        private static bool IsTheSame(War.Contestant c1, ContestantRequest c2)
        {
            return c2.Definition[lastNameKey] == c1.Definition[lastNameKey] && c2.Definition[firstNameKey] == c1.Definition[firstNameKey];
        }

        private static async Task VerifyThatTheWarIdIsCorrect()
        {
            var warRepo = new WarRepository(Settings.Default.WarDb);
            var war = await warRepo.Get(WarId);
            war.Title.Should().Be("Presidential Candidate War 2016", "you may have set the wrong War ID");
        }
    }
}
