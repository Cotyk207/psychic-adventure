// Independent launchers for official web services. No API, embedded browser or credential handling.
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Launcher
{
#if CHATGPT
    private const string ServiceName = "ChatGPT";
    private const string ServiceUrl = "https://chatgpt.com/";
#elif CLAUDE
    private const string ServiceName = "Claude";
    private const string ServiceUrl = "https://claude.ai/";
#elif GEMINI
    private const string ServiceName = "Gemini";
    private const string ServiceUrl = "https://gemini.google.com/";
#elif PERPLEXITY
    private const string ServiceName = "Perplexity";
    private const string ServiceUrl = "https://www.perplexity.ai/";
#elif COPILOT
    private const string ServiceName = "Copilot";
    private const string ServiceUrl = "https://copilot.microsoft.com/";
#else
#error A service must be selected at build time.
#endif

    [STAThread]
    private static void Main()
    {
        try
        {
            string browser = DefaultAppModeBrowser();
            if (browser != null)
            {
                // Chrome / Edge app windows use the user's usual browser profile and sign-in.
                Process.Start(new ProcessStartInfo(browser, "--app=" + ServiceUrl) { UseShellExecute = true });
            }
            else
            {
                // Other browsers open a normal tab, preserving the user's browser choice.
                Process.Start(new ProcessStartInfo(ServiceUrl) { UseShellExecute = true });
            }
        }
        catch (Exception)
        {
            MessageBox.Show("Не удалось открыть " + ServiceName + ". Проверьте, установлен ли браузер по умолчанию.",
                "PSYCHIC · " + ServiceName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static string DefaultAppModeBrowser()
    {
        try
        {
            using (var choice = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice"))
            {
                string progId = choice == null ? null : choice.GetValue("ProgId") as string;
                if (String.IsNullOrEmpty(progId)) return null;
                using (var command = Registry.ClassesRoot.OpenSubKey(progId + @"\shell\open\command"))
                {
                    string value = command == null ? null : command.GetValue(null) as string;
                    if (String.IsNullOrEmpty(value)) return null;
                    value = Environment.ExpandEnvironmentVariables(value.Trim());
                    string path;
                    if (value.StartsWith("\""))
                    {
                        int end = value.IndexOf('"', 1);
                        if (end <= 1) return null;
                        path = value.Substring(1, end - 1);
                    }
                    else
                    {
                        int end = value.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
                        if (end < 0) return null;
                        path = value.Substring(0, end + 4);
                    }
                    string name = Path.GetFileName(path);
                    if (!File.Exists(path) || !(name.Equals("chrome.exe", StringComparison.OrdinalIgnoreCase)
                        || name.Equals("msedge.exe", StringComparison.OrdinalIgnoreCase))) return null;
                    return path;
                }
            }
        }
        catch (Exception) { return null; }
    }
}
