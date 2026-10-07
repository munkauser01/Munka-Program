param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$OwnerPid)
$ErrorActionPreference = 'Stop'

# No Explorer reparenting, undocumented shell messages, registry changes, or
# injected code. All changes are limited to windows owned by the launching app.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MunkaOverlayNative {
  static readonly object InputLock = new object();
  static string latestInput;
  public static volatile bool InputClosed;
  // Console.In on Windows PowerShell is a synchronized TextReader whose
  // ReadLineAsync can block synchronously. Keep input off the placement loop.
  public static void StartInput() {
    var reader = new System.Threading.Thread(() => {
      try {
        string line;
        while ((line = Console.ReadLine()) != null) { lock (InputLock) { latestInput = line; } }
      } finally { InputClosed = true; }
    });
    reader.IsBackground = true;
    reader.Start();
  }
  public static string TakeLatestInput() { lock (InputLock) { var line = latestInput; latestInput = null; return line; } }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLong64(IntPtr window, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong32(IntPtr window, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] static extern IntPtr SetWindowLong64(IntPtr window, int index, IntPtr value);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW")] static extern int SetWindowLong32(IntPtr window, int index, int value);
  [DllImport("user32.dll", SetLastError=true)] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder result, int count);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
  static long Style(IntPtr window) { return IntPtr.Size == 8 ? GetWindowLong64(window, -20).ToInt64() : GetWindowLong32(window, -20); }
  public static bool IsTopmost(IntPtr window) { return (Style(window) & 8L) != 0; }
  public static bool IsToolWindow(IntPtr window) { return (Style(window) & 0x80L) != 0 && (Style(window) & 0x40000L) == 0; }
  public static bool HasNoBorder(IntPtr window) {
    // Layered windows may have no DWM border attribute because they have no
    // native frame at all. Test that documented style path as well.
    long style = IntPtr.Size == 8 ? GetWindowLong64(window, -16).ToInt64() : GetWindowLong32(window, -16);
    int value; return (style & 0xC40000L) == 0 || (DwmGetWindowAttribute(window,34,out value,4) == 0 && value == -2);
  }
  public static bool Owns(IntPtr window, uint owner) {
    uint actual; return IsWindow(window) && GetWindowThreadProcessId(window, out actual) != 0 && owner == actual;
  }
  public static long ForegroundHandle() { return GetForegroundWindow().ToInt64(); }
  public static string ForegroundKind(uint owner) {
    var window = GetForegroundWindow();
    if (window == IntPtr.Zero) return "transient";
    uint actual; GetWindowThreadProcessId(window, out actual);
    if (actual == owner) return "munka";
    if (window == GetShellWindow()) return "desktop";
    var name = new StringBuilder(256); GetClassName(window, name, name.Capacity);
    // Shell class fallback covers current Explorer desktop hosts. This is a
    // best-effort recovery hint, not an undocumented WorkerW parent attachment.
    var cls = name.ToString();
    if (cls == "Progman" || cls == "WorkerW") return "desktop";
    if (cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return "transient";
    return "app";
  }
  public static bool PointerDown() { return (GetAsyncKeyState(1) & 0x8000) != 0; }
  public static void Prepare(IntPtr window) {
    long style = IntPtr.Size == 8 ? GetWindowLong64(window, -20).ToInt64() : GetWindowLong32(window, -20);
    long updated = (style | 0x80L) & ~0x40000L; // TOOLWINDOW, clear APPWINDOW
    if (updated != style) {
      if (IntPtr.Size == 8) SetWindowLong64(window, -20, new IntPtr(updated));
      else SetWindowLong32(window, -20, (int)updated);
      SetWindowPos(window, IntPtr.Zero, 0, 0, 0, 0, 0x37); // FRAMECHANGED, NOMOVE, NOSIZE, NOZORDER, NOACTIVATE
    }
    int enabled = 1;
    DwmSetWindowAttribute(window, 12, ref enabled, 4); // DWMWA_EXCLUDED_FROM_PEEK
    int noBorder = -2; // DWMWA_COLOR_NONE: no Windows 11 accent outline.
    DwmSetWindowAttribute(window, 34, ref noBorder, 4); // DWMWA_BORDER_COLOR
    int noCorners = 1;
    DwmSetWindowAttribute(window, 33, ref noCorners, 4); // DWMWA_WINDOW_CORNER_PREFERENCE
  }
  public static bool Place(IntPtr window, string layer, bool desktopForeground) {
    if (!IsWindowVisible(window) || IsIconic(window)) ShowWindow(window, 4); // SHOWNOACTIVATE
    IntPtr after = layer == "topmost" ? new IntPtr(-1) : desktopForeground ? IntPtr.Zero : new IntPtr(1);
    return SetWindowPos(window, after, 0, 0, 0, 0, 0x13); // NOMOVE, NOSIZE, NOACTIVATE
  }
}
'@

$owner = [Diagnostics.Process]::GetProcessById($OwnerPid)
$windows = @()
$desktopForeground = $false
$reportedReady = $false
$lastReport = ''
[MunkaOverlayNative]::StartInput()
while (-not $owner.HasExited -and -not [MunkaOverlayNative]::InputClosed) {
  $line = [MunkaOverlayNative]::TakeLatestInput()
  if ($null -ne $line) {
    $message = ConvertFrom-Json -InputObject $line
    $windows = @($message.windows | Select-Object -First 2)
  }
  $kind = [MunkaOverlayNative]::ForegroundKind([uint32]$OwnerPid)
  if ($kind -eq 'desktop') { $desktopForeground = $true }
  elseif ($kind -eq 'app') { $desktopForeground = $false }
  elseif ($kind -eq 'munka') {
    $foreground = [string][MunkaOverlayNative]::ForegroundHandle()
    if ($foreground -notin @($windows | ForEach-Object { [string]$_.handle })) { $desktopForeground = $false }
  }
  $observed = @()
  foreach ($item in $windows) {
    if ($item.layer -notin @('desktop','topmost')) { continue }
    $handle = [IntPtr]::new([long]::Parse([string]$item.handle))
    if (-not [MunkaOverlayNative]::Owns($handle,[uint32]$OwnerPid)) { continue }
    [MunkaOverlayNative]::Prepare($handle)
    # Do not change stacking in the middle of an interactive header drag, resize,
    # task click, or menu click. The placement resumes when the pointer is up.
    if (-not [MunkaOverlayNative]::PointerDown()) {
      $placed = [MunkaOverlayNative]::Place($handle,[string]$item.layer,$desktopForeground)
      if (-not $placed) { [Console]::Out.WriteLine('{"error":true}'); [Console]::Out.Flush() }
      elseif (-not $reportedReady) { $reportedReady=$true; [Console]::Out.WriteLine('{"ready":true}'); [Console]::Out.Flush() }
    }
    $observed += @{ surface=[string]$item.surface; topmost=[MunkaOverlayNative]::IsTopmost($handle); toolWindow=[MunkaOverlayNative]::IsToolWindow($handle); borderSuppressed=[MunkaOverlayNative]::HasNoBorder($handle); visible=[MunkaOverlayNative]::IsWindowVisible($handle) }
  }
  $report = ConvertTo-Json -InputObject @{ windows=@($observed) } -Compress
  if ($report -ne $lastReport) { [Console]::Out.WriteLine($report); [Console]::Out.Flush(); $lastReport=$report }
  [System.Threading.Thread]::Sleep(150)
}
