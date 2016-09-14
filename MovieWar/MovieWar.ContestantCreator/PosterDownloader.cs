using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Threading.Tasks;
using System;
using War.Contestants.Sql;
using System.Net.Http;
using System.IO;

namespace MovieWar.ContestantCreator
{
    [TestClass]
    public class PosterDownloader
    {
        [Ignore]
        [TestMethod]
        public async Task GivenMovieContestantsAndPath_DownloadPostersAndSaveThem()
        {
            var contestants = FileContestantRequestFactory.GetContestants();
            const string path = @"C:\posters";
            
            foreach (var c in contestants)
            {
                try
                {
                    await Download(c, path);
                }
                catch (Exception ex)
                {
                    throw new Exception($"Failed to get poster for {c.Definition["Title"]} ({c.Definition["Year"]})", ex);
                }
            }
        }

        [Ignore]
        [TestMethod]
        public async Task GivenMovieContestantsAndUrl_ChangePosterUrlsAndSave()
        {
            var contestants = FileContestantRequestFactory.GetContestants();
            const string baseUri = @"http://moviewar.azurewebsites.net/Posters/";

            foreach (var c in contestants)
            {
                try
                {
                    var uri = c.Definition["Poster"];
                    var filename = GetFileName(uri);
                    var newUri = baseUri + filename;
                    c.Definition["Poster"] = newUri;
                }
                catch (Exception ex)
                {
                    throw new Exception($"Failed to set poster for {c.Definition["Title"]} ({c.Definition["Year"]})", ex);
                }
            }

            await FileContestantRequestFactory.WriteMovieContestantsToFile(contestants);
        }


        private async Task Download(ContestantRequest c, string path)
        {
            var uri = c.Definition["Poster"];
            var filename = GetFileName(uri);
            var fullFileName = Path.Combine(path, filename);
            using (var client = new HttpClient())
            {
                var response = await client.GetAsync(uri);
                response.EnsureSuccessStatusCode();
                using (var contentStream = await response.Content.ReadAsStreamAsync())
                using (var fileStream = new FileStream(fullFileName, FileMode.Create, FileAccess.Write, FileShare.None, 4096, true))
                {
                    await contentStream.CopyToAsync(fileStream);
                }
            }
        }

        private string GetFileName(string hrefLink)
        {
            string[] parts = hrefLink.Split('/');
            string fileName = "";

            if (parts.Length > 0)
                fileName = parts[parts.Length - 1];
            else
                fileName = hrefLink;

            return fileName;
        }
    }
}
