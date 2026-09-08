param([string]$Action,[string]$ImagePath,[int]$MonitorIndex=0,[string]$Snapshot)
$ErrorActionPreference='Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDesktopWallpaper {
 void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID,[MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
 [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
 [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
 uint GetMonitorDevicePathCount();
}
public class Wallpaper {
 static IDesktopWallpaper Get(){return (IDesktopWallpaper)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("C2CF3110-460E-4FC1-B9D0-8A1C0C9CC4BD")));}
 public static string[] Read(){var w=Get();var r=new string[w.GetMonitorDevicePathCount()];for(uint i=0;i<r.Length;i++)r[i]=w.GetWallpaper(w.GetMonitorDevicePathAt(i));return r;}
 public static void Set(int i,string p){var w=Get();w.SetWallpaper(w.GetMonitorDevicePathAt((uint)i),p);}
}
'@
if($Action -eq 'get'){ConvertTo-Json -InputObject @([Wallpaper]::Read()) -Compress}
elseif($Action -eq 'set'){[Wallpaper]::Set($MonitorIndex,$ImagePath)}
elseif($Action -eq 'restore'){$items=ConvertFrom-Json $Snapshot;for($i=0;$i -lt $items.Count;$i++){[Wallpaper]::Set($i,[string]$items[$i])}}
