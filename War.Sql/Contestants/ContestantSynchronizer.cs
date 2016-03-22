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
        public async Task SyncContestants(string connectionString, ContestantRequest[] masterContestantList, int warId, string warTitle, Func<Contestant, ContestantRequest, bool> IsTheSame)
        {
            await VerifyThatTheWarIdIsCorrect(connectionString, warId, warTitle);

            var repository = new ContestantRepository(connectionString);
            var contestantsInDb = await repository.GetAll(warId);

            await UpdateExistingCandidates(repository, contestantsInDb, masterContestantList, warId, IsTheSame);
            await InsertNewCandidates(repository, contestantsInDb, masterContestantList, warId, IsTheSame);
            await DeleteOldCandidates(repository, contestantsInDb, masterContestantList, warId, IsTheSame);
        }

        private static async Task UpdateExistingCandidates(ContestantRepository repository, IEnumerable<Contestant> contestantsInDb, ContestantRequest[] masterContestantList, int warId, Func<Contestant, ContestantRequest, bool> IsTheSame)
        {
            var updates = masterContestantList.Where(c1 => contestantsInDb.Any(c2 => IsTheSame(c2, c1)))
                                    .Select(c => new Contestant
                                    {
                                        Definition = c.Definition,
                                        Id = contestantsInDb.Single(c1 => IsTheSame(c1, c)).Id
                                    });
            foreach (var c in updates)
            {
                await repository.Update(warId, c);
            }
        }

        private static async Task InsertNewCandidates(ContestantRepository repository, IEnumerable<Contestant> contestantsInDb, ContestantRequest[] masterContestantList, int warId, Func<Contestant, ContestantRequest, bool> IsTheSame)
        {
            var additions = masterContestantList.Where(c1 => !contestantsInDb.Any(c2 => IsTheSame(c2, c1)));
            
            foreach (var c in additions)
            {
                await repository.Create(warId, c);
            }
        }

        private static async Task DeleteOldCandidates(ContestantRepository repository, IEnumerable<Contestant> contestantsInDb, ContestantRequest[] masterContestantList, int warId, Func<Contestant, ContestantRequest, bool> IsTheSame)
        {
            var additions = contestantsInDb.Where(c1 => !masterContestantList.Any(c2 => IsTheSame(c1, c2)));

            foreach (var c in additions)
            {
                await repository.Delete(warId, c);
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
