namespace War.MatchFactories
{
    public interface IMatchFactory
    {
        MatchWithContestants Create(int warId);
    }
}
