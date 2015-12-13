namespace War
{
    public interface IMatchFactory
    {
        MatchWithContestants Create(int warId);
    }
}
