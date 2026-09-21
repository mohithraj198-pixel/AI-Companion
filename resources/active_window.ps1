$definition = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class WinUtil {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static string GetActive() {
        try {
            IntPtr handle = GetForegroundWindow();
            if (handle == IntPtr.Zero) {
                return "Idle|";
            }

            uint processId = 0;
            GetWindowThreadProcessId(handle, out processId);

            string processName = "Unknown";
            try {
                if (processId > 0) {
                    using (Process proc = Process.GetProcessById((int)processId)) {
                        processName = proc.ProcessName;
                    }
                }
            } catch {}

            StringBuilder title = new StringBuilder(1024);
            GetWindowText(handle, title, 1024);

            return processName + "|" + title.ToString().Trim();
        } catch (Exception ex) {
            return "Error|" + ex.Message;
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $definition -ErrorAction SilentlyContinue
} catch {}

if ($args.Count -gt 0 -and $args[0] -eq "--watch") {
    $last = ""
    while ($true) {
        $curr = [WinUtil]::GetActive()
        if ($curr -ne $last) {
            $last = $curr
            [Console]::WriteLine($curr)
            [Console]::Out.Flush()
        }
        Start-Sleep -Milliseconds 350
    }
} else {
    [Console]::WriteLine([WinUtil]::GetActive())
}
