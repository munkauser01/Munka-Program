param([string]$Action,[string]$ImagePath,[string]$MonitorId,[string]$Snapshot)
$ErrorActionPreference='Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct MonitorRect {public int Left,Top,Right,Bottom;}
public class MonitorBackground {public string Id,Path;public int X,Y,Width,Height;}
[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDesktopWallpaper {
 void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID,[MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
 [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
 [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
 uint GetMonitorDevicePathCount();
 void GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID,out MonitorRect rect);
}
public class Wallpaper {
 static IDesktopWallpaper Get(){return (IDesktopWallpaper)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("C2CF3110-460E-4FC1-B9D0-8A1C0C9CC4BD")));}
 public static MonitorBackground[] Read(){var w=Get();var r=new MonitorBackground[w.GetMonitorDevicePathCount()];for(uint i=0;i<r.Length;i++){var id=w.GetMonitorDevicePathAt(i);MonitorRect rect;w.GetMonitorRECT(id,out rect);r[i]=new MonitorBackground{Id=id,Path=w.GetWallpaper(id),X=rect.Left,Y=rect.Top,Width=rect.Right-rect.Left,Height=rect.Bottom-rect.Top};}return r;}
 public static void Set(string id,string p){var w=Get();bool found=false;for(uint i=0;i<w.GetMonitorDevicePathCount();i++)if(w.GetMonitorDevicePathAt(i)==id)found=true;if(!found)throw new Exception("Display is disconnected");w.SetWallpaper(id,p);}
}
'@
if($Action -eq 'get'){ConvertTo-Json -InputObject @([Wallpaper]::Read()) -Compress}
elseif($Action -eq 'set'){[Wallpaper]::Set($MonitorId,$ImagePath)}
elseif($Action -eq 'restore'){
 $items=@(ConvertFrom-Json $Snapshot)
 $monitors=@([Wallpaper]::Read())
 foreach($item in $items){
  if($item -is [string]){
   if($items.Count -ne 1 -or $monitors.Count -ne 1){throw 'Legacy snapshot requires the original single display.'}
   [Wallpaper]::Set($monitors[0].Id,$item)
  }else{[Wallpaper]::Set($item.Id,$item.Path)}
 }
}

