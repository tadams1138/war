using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using War.Contestants;
using War.Contestants.Sql;
using War.Wars.Sql;

namespace War.Sql.Contestants
{
    public class ContestantSynchronizer
    {
        public async Task SyncContestants(string connectionString, ContestantRequest[] contestants, int warId, string warTitle, Func<Contestant, ContestantRequest, bool> IsTheSame)
        {
            await VerifyThatTheWarIdIsCorrect(connectionString, warId, warTitle);

            var repository = new ContestantRepository(connectionString);
            var existingContestants = await repository.GetAll(warId);

            await UpdateExistingCandidates(repository, existingContestants, contestants, warId, IsTheSame);
            await InsertNewCandidates(repository, existingContestants, contestants, warId, IsTheSame);
        }

        private static async Task UpdateExistingCandidates(ContestantRepository repository, IEnumerable<Contestant> existingContestants, ContestantRequest[] contestants, int warId, Func<Contestant, ContestantRequest, bool> IsTheSame)
        {
            var updates = contestants.Where(c1 => existingContestants.Any(c2 => IsTheSame(c2, c1)))
                                    .Select(c => new Contestant
                                    {
                                        Definition = c.Definition,
                                        Id = existingContestants.Single(c1 => IsTheSame(c1, c)).Id
                                    });
            foreach (var c in updates)
            {
                await repository.Update(warId, c);
            }
        }

        private static async Task InsertNewCandidates(ContestantRepository repository, IEnumerable<Contestant> existingContestants, ContestantRequest[] contestants, int warId, Func<Contestant, ContestantRequest, bool> IsTheSame)
        {
            var additions = contestants.Where(c1 => !existingContestants.Any(c2 => IsTheSame(c2, c1)));
            
            foreach (var c in additions)
            {
                await repository.Create(warId, c);
            }
        }

        private static async Task VerifyThatTheWarIdIsCorrect(string connectionString, int warId, string title)
        {
            var warRepo = new WarRepository(connectionString);
            var war = await warRepo.Get(warId);
            if (war.Title != title)
            {
                throw new Exception("you may have set the wrong War ID");
            }
        }
    }
}
