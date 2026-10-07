#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include <node_api.h>
#include <cstdint>
#include <cstring>

// Only the Electron main process loads this addon. Its handle is an NSView*,
// stored as pointer bytes in a Buffer, not the address of the Buffer itself.
// https://www.electronjs.org/docs/latest/api/base-window#wingetnativewindowhandle
namespace {

napi_value Fail(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

bool Check(napi_env env, napi_status status) {
  if (status == napi_ok) return true;
  bool pending = false;
  napi_is_exception_pending(env, &pending);
  if (!pending) napi_throw_error(env, nullptr, "Could not read the Mac overlay state.");
  return false;
}

NSInteger DesktopLevel() {
  // Finder's desktop icons remain below the interactive widgets. Normal app
  // windows remain above them even when a widget accepts a click or keyboard.
  return static_cast<NSInteger>(CGWindowLevelForKey(kCGDesktopIconWindowLevelKey)) + 1;
}

NSWindow* OwnWindow(napi_env env, napi_value handle) {
  if (![NSThread isMainThread] || NSApp == nil) {
    Fail(env, "The Mac overlay must run in the Electron main process.");
    return nil;
  }
  bool isBuffer = false;
  if (!Check(env, napi_is_buffer(env, handle, &isBuffer))) return nil;
  if (!isBuffer) {
    Fail(env, "Pass the widget's native window handle Buffer.");
    return nil;
  }
  void* bytes = nullptr;
  size_t length = 0;
  if (!Check(env, napi_get_buffer_info(env, handle, &bytes, &length))) return nil;
  if (length != sizeof(uintptr_t) || bytes == nullptr) {
    Fail(env, "The Mac widget native handle has an invalid size.");
    return nil;
  }
  uintptr_t address = 0;
  std::memcpy(&address, bytes, sizeof(address));
  // Never dereference a pointer supplied from JavaScript. Compare it against
  // AppKit's current, process-owned content views, rejecting stale or foreign
  // handles before sending any Objective-C message to their windows.
  for (NSWindow* window in [NSApp windows]) {
    const uintptr_t content = reinterpret_cast<uintptr_t>((__bridge void*)[window contentView]);
    if (address != 0 && address == content) return window;
  }
  Fail(env, "The Mac widget native handle does not belong to a live Munka window.");
  return nil;
}

bool Number(napi_env env, napi_value object, const char* name, int64_t number) {
  napi_value value;
  return Check(env, napi_create_int64(env, number, &value)) &&
         Check(env, napi_set_named_property(env, object, name, value));
}

bool Boolean(napi_env env, napi_value object, const char* name, bool flag) {
  napi_value value;
  return Check(env, napi_get_boolean(env, flag, &value)) &&
         Check(env, napi_set_named_property(env, object, name, value));
}

napi_value Snapshot(napi_env env, NSWindow* window) {
  napi_value object;
  if (!Check(env, napi_create_object(env, &object))) return nullptr;
  const NSWindowCollectionBehavior behavior = [window collectionBehavior];
  const NSInteger level = [window level];
  if (!Number(env, object, "level", level) ||
      !Number(env, object, "desktopLevel", DesktopLevel()) ||
      !Number(env, object, "floatingLevel", NSFloatingWindowLevel) ||
      !Number(env, object, "normalLevel", NSNormalWindowLevel) ||
      !Number(env, object, "windowNumber", [window windowNumber]) ||
      !Number(env, object, "collectionBehavior", behavior) ||
      !Boolean(env, object, "ignoresMouseEvents", [window ignoresMouseEvents]) ||
      !Boolean(env, object, "allSpaces", behavior & NSWindowCollectionBehaviorCanJoinAllSpaces) ||
      !Boolean(env, object, "stationary", behavior & NSWindowCollectionBehaviorStationary) ||
      !Boolean(env, object, "ignoresCycle", behavior & NSWindowCollectionBehaviorIgnoresCycle) ||
      !Boolean(env, object, "fullScreenAuxiliary", behavior & NSWindowCollectionBehaviorFullScreenAuxiliary) ||
      !Boolean(env, object, "nonactivating", [window styleMask] & NSWindowStyleMaskNonactivatingPanel) ||
      !Boolean(env, object, "canBecomeKeyWindow", [window canBecomeKeyWindow]) ||
      !Boolean(env, object, "visible", [window isVisible]) ||
      !Boolean(env, object, "keyWindow", [window isKeyWindow])) return nullptr;
  const char* layer = level == DesktopLevel() ? "desktop" :
                      level == NSFloatingWindowLevel ? "topmost" : "other";
  napi_value value;
  if (!Check(env, napi_create_string_utf8(env, layer, NAPI_AUTO_LENGTH, &value)) ||
      !Check(env, napi_set_named_property(env, object, "layer", value))) return nullptr;
  return object;
}

napi_value Apply(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    @try {
      size_t argc = 3;
      napi_value args[3];
      if (!Check(env, napi_get_cb_info(env, info, &argc, args, nullptr, nullptr))) return nullptr;
      if (argc != 2) return Fail(env, "Pass a Mac widget native handle and desktop or topmost layer.");
      napi_valuetype type;
      if (!Check(env, napi_typeof(env, args[1], &type))) return nullptr;
      if (type != napi_string) return Fail(env, "Choose the desktop or topmost Mac widget layer.");
      char layer[16] = {};
      size_t length = 0;
      if (!Check(env, napi_get_value_string_utf8(env, args[1], layer, sizeof(layer), &length))) return nullptr;
      if (length != 7) return Fail(env, "Choose the desktop or topmost Mac widget layer.");
      const bool desktop = std::strcmp(layer, "desktop") == 0;
      if (!desktop && std::strcmp(layer, "topmost") != 0) return Fail(env, "Choose the desktop or topmost Mac widget layer.");
      NSWindow* window = OwnWindow(env, args[0]);
      if (window == nil) return nullptr;
      // Electron's type:'panel' supplies its nonactivating window subclass.
      // Preserve that behavior rather than changing the style after creation.
      if (!([window styleMask] & NSWindowStyleMaskNonactivatingPanel)) {
        return Fail(env, "Create the Mac widget with Electron's panel window type.");
      }
      if (DesktopLevel() >= NSNormalWindowLevel) return Fail(env, "macOS did not provide a desktop window layer.");
      NSWindowCollectionBehavior behavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
          NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle;
      if (!desktop) behavior |= NSWindowCollectionBehaviorFullScreenAuxiliary;
      [window setCollectionBehavior:behavior];
      [window setHidesOnDeactivate:NO];
      [window setExcludedFromWindowsMenu:YES];
      [window setLevel:desktop ? DesktopLevel() : NSFloatingWindowLevel];
      // Order only within the selected native level; this never activates Munka
      // or reveals a widget the user hid. Electron owns visibility and input.
      if ([window isVisible]) [window orderFrontRegardless];
      return Snapshot(env, window);
    } @catch (NSException* exception) {
      return Fail(env, "macOS could not place the widget in the selected layer.");
    }
  }
}

napi_value Inspect(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    @try {
      size_t argc = 2;
      napi_value args[2];
      if (!Check(env, napi_get_cb_info(env, info, &argc, args, nullptr, nullptr))) return nullptr;
      if (argc != 1) return Fail(env, "Pass a Mac widget native handle to inspect.");
      NSWindow* window = OwnWindow(env, args[0]);
      return window == nil ? nullptr : Snapshot(env, window);
    } @catch (NSException* exception) {
      return Fail(env, "macOS could not inspect the widget's placement.");
    }
  }
}

napi_value Initialize(napi_env env, napi_value exports) {
  const napi_property_descriptor properties[] = {
      {"apply", nullptr, Apply, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"inspect", nullptr, Inspect, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  if (!Check(env, napi_define_properties(env, exports, 2, properties))) return nullptr;
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
