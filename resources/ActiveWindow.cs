using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace AICompanionNative
{
    class Program
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        static string GetActiveWindowInfo()
        {
            try
            {
                IntPtr handle = GetForegroundWindow();
                if (handle == IntPtr.Zero)
                {
                    return "None|";
                }

                uint processId = 0;
                GetWindowThreadProcessId(handle, out processId);

                string processName = "Unknown";
                try
                {
                    if (processId > 0)
                    {
                        using (Process proc = Process.GetProcessById((int)processId))
                        {
                            processName = proc.ProcessName;
                        }
                    }
                }
                catch
                {
                    processName = "ProtectedProcess";
                }

                StringBuilder title = new StringBuilder(1024);
                GetWindowText(handle, title, 1024);

                return processName + "|" + title.ToString().Trim();
            }
            catch (Exception ex)
            {
                return "Error|" + ex.Message;
            }
        }

        static void Main(string[] args)
        {
            bool watchMode = args.Length > 0 && args[0] == "--watch";

            if (!watchMode)
            {
                Console.WriteLine(GetActiveWindowInfo());
                return;
            }

            string lastInfo = "";
            while (true)
            {
                string current = GetActiveWindowInfo();
                if (current != lastInfo)
                {
                    lastInfo = current;
                    Console.WriteLine(current);
                    Console.Out.Flush();
                }
                Thread.Sleep(300);
            }
        }
    }
}
