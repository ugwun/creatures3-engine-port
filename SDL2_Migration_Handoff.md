# Task: Migrate from SDL 1.2 to SDL 2.0

## Motivation

The engine currently uses **SDL 1.2** for windowing/input and **SDL2_mixer** for audio. This is problematic:

1. **SDL 1.2 is unmaintained** — no updates since 2012.
2. **Dual-linking SDL1 + SDL2** causes header conflicts. The CMake build hacks around this with per-file include paths (line 22 of `CMakeLists.txt`), and the sound system writes WAV data to temp files on disk because `Mix_LoadWAV_RW` crashes due to SDL1/SDL2 RWops incompatibility (see `engine/Sound/stub/stub_Soundlib.cpp:191`).
3. **Missing features**: no HiDPI/Retina support, no proper fullscreen (`DisplayEngine::Start()` hard-returns `false` for fullscreen), no `SDL_TEXTINPUT` for Unicode text entry, no window resize events.
4. **Cross-platform**: SDL2 works on macOS, Linux, and Windows. This migration is a prerequisite for future Linux/Windows ports.

## Scope

Replace all SDL 1.2 API usage with SDL 2.0 equivalents. The engine does **software rendering** (CPU pixel-pushing into a `uint16*` buffer), so there's no GPU/OpenGL involvement — SDL just provides the window and receives the finished frame.

## Files to Modify

### 1. `CMakeLists.txt` (root)

**Current state**: Uses `find_package(SDL REQUIRED)` (SDL 1.2) plus a separate `find_library(SDL2_MIXER_LIB SDL2_mixer)` with hardcoded Homebrew include paths.

**Change to**: Use `find_package(SDL2 REQUIRED)` for everything. Remove the per-file `COMPILE_FLAGS` hack on line 22-23. Link against `SDL2::SDL2` and `SDL2_mixer::SDL2_mixer` (or equivalent imported targets).

Key lines:
- Line 16: `find_package(SDL REQUIRED)` → `find_package(SDL2 REQUIRED)`
- Lines 19-23: Remove the SDL2_mixer per-file include hack
- Lines 208-211: Update `target_include_directories` to use SDL2 include dirs
- Lines 215-219: Update `target_link_libraries` to use SDL2 libs

### 2. `engine/Display/SDL/SDL_DisplayEngine.h`

**Add members**:
- `SDL_Window* myWindow;` — the SDL2 window handle
- Optionally `SDL_Renderer*` if you go the texture-streaming route (but `SDL_GetWindowSurface` is simpler and preserves the current architecture)

**No other changes needed** — all `SDL_Surface*` members, `SDL_LockSurface`/`SDL_UnlockSurface` calls, and `SDL_BlitSurface` are identical in SDL2.

### 3. `engine/Display/SDL/SDL_DisplayEngine.cpp` (3,149 lines)

Only a handful of lines need changing. The vast majority of this file is hand-written pixel blitting that doesn't touch SDL at all.

**`DisplayEngine::Start()` (line 122-159)**:
```cpp
// BEFORE (SDL 1.2):
myFrontBuffer = SDL_SetVideoMode(800, 600, 16, 0);
myBackBuffer = SDL_AllocSurface(SDL_SWSURFACE, 800, 600, 16, 0xF800, 0x07E0, 0x001F, 0);

// AFTER (SDL 2.0):
myWindow = SDL_CreateWindow("Creatures Docking Station",
    SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
    800, 600, 0);
myFrontBuffer = SDL_GetWindowSurface(myWindow);
myBackBuffer = SDL_CreateRGBSurface(0, 800, 600, 16, 0xF800, 0x07E0, 0x001F, 0);
```

**`DisplayEngine::DrawToFrontBuffer()` (line 629-662)**:
```cpp
// BEFORE (SDL 1.2):
SDL_BlitSurface(myBackBuffer, NULL, myFrontBuffer, NULL);
SDL_UpdateRect(myFrontBuffer, 0, 0, 0, 0);

// AFTER (SDL 2.0):
SDL_BlitSurface(myBackBuffer, NULL, myFrontBuffer, NULL);
SDL_UpdateWindowSurface(myWindow);
```

**`DisplayEngine::GetPixelFormat()` (line ~3095-3120)**: The `myFrontBuffer->format` access is identical in SDL2. No change needed.

**`DisplayEngine::Stop()` (line 514)**: Add `SDL_DestroyWindow(myWindow)` cleanup.

**Fullscreen** (line 130-131): Now you can actually implement this:
```cpp
if (myFullScreenFlag) {
    myWindow = SDL_CreateWindow(..., SDL_WINDOW_FULLSCREEN_DESKTOP);
    myFrontBuffer = SDL_GetWindowSurface(myWindow);
    // ... same backbuffer setup
}
```

### 4. `engine/Display/SDL/SDL_Main.cpp` (699 lines)

**Keysym types** (line 366-436):
- `SDLKey` → `SDL_Keycode`
- `SDLK_*` constants are mostly the same in SDL2, but some are renamed:
  - `SDLK_KP0`-`SDLK_KP9` → `SDLK_KP_0`-`SDLK_KP_9`
  - `SDLK_NUMLOCK` → `SDLK_NUMLOCKCLEAR`
  - `SDLK_CAPSLOCK` remains (but was `SDLK_CAPSLOCK` in 1.2 too — verify)
- `event.key.keysym.sym` type changes from `SDLKey` to `SDL_Keycode` — same usage pattern

**Event handling** (line 438-497):
- `SDL_ACTIVEEVENT` → remove (or map to `SDL_WINDOWEVENT`)
- Add `SDL_TEXTINPUT` case for proper Unicode text entry:
  ```cpp
  case SDL_TEXTINPUT: {
      // event.text.text is a UTF-8 string
      // For ASCII range, just take the first byte
      char c = event.text.text[0];
      if (c >= 0x20 && c <= 0x7E)
          theApp.GetInputManager().SysAddTranslatedCharEvent((int)c);
      break;
  }
  ```
  And call `SDL_StartTextInput()` during init.
- Remove the inline `SysAddTranslatedCharEvent` call from `SDL_KEYDOWN` handler (lines 467-475) — SDL2's `SDL_TEXTINPUT` replaces this entirely.

**`SDL_Init` (line 290)**: Same call, identical in SDL2.

**Executable path** (line 268-276): `_NSGetExecutablePath` is macOS-specific and unrelated to SDL. No change.

**Window title**: Remove any `SDL_WM_SetCaption` if present (not found in current code). In SDL2 the title is set in `SDL_CreateWindow`.

### 5. `engine/Sound/stub/stub_Soundlib.cpp` (618 lines)

**Remove the temp-file hack** (lines 190-214). The WAV-from-memory path currently writes to `/tmp/lc2e_mng_*.wav` and reloads via `Mix_LoadWAV()` because SDL1/SDL2 RWops are incompatible. With pure SDL2, you can use `SDL_RWFromMem` + `Mix_LoadWAV_RW` directly:

```cpp
// BEFORE:
snprintf(tmpPath, sizeof(tmpPath), "/tmp/lc2e_mng_%08x.wav", wave);
FILE *tmpFp = fopen(tmpPath, "wb");
fwrite(wavData, 1, wavSize, tmpFp);
fclose(tmpFp);
Mix_Chunk *chunk = Mix_LoadWAV(tmpPath);
unlink(tmpPath);

// AFTER:
SDL_RWops *rw = SDL_RWFromMem(wavData, wavSize);
Mix_Chunk *chunk = Mix_LoadWAV_RW(rw, 1); // 1 = free RWops after load
```

**SDL2_mixer include** (line 15): Change `#include <SDL_mixer.h>` to `#include <SDL2/SDL_mixer.h>` or just `<SDL_mixer.h>` depending on how your include paths are configured. The per-file compile flags hack in CMake goes away.

### 6. `engine/Display/SDL/SDL_RemoteCamera.cpp`

Likely uses `SDL_Surface` for off-screen rendering of secondary camera views. Check for any `SDL_AllocSurface` calls and rename to `SDL_CreateRGBSurface`.

### 7. `engine/Display/SDL/SDL_ErrorDialog.cpp`

Check for any SDL 1.2 message box usage. SDL2 provides `SDL_ShowSimpleMessageBox()` which could replace platform-specific error dialogs.

## APIs That Are Identical (No Changes Needed)

These SDL functions work the same in both versions — don't waste time on them:

- `SDL_Surface`, `SDL_PixelFormat` struct layout
- `SDL_BlitSurface()`
- `SDL_LockSurface()` / `SDL_UnlockSurface()`
- `SDL_FreeSurface()`
- `SDL_PollEvent()` / `SDL_Event`
- `SDL_GetTicks()` / `SDL_Delay()`
- `SDL_Init()` / `SDL_Quit()`
- `SDL_MOUSEMOTION`, `SDL_MOUSEBUTTONDOWN`, `SDL_MOUSEBUTTONUP` event types
- `SDL_KEYDOWN`, `SDL_KEYUP` event types
- `SDL_QUIT` event type

## Verification

1. **Build**: `cmake --build build --parallel` — must compile cleanly
2. **Tests**: `cd build && ctest --output-on-failure` — all 418 tests must pass (tests don't use SDL, so they should be unaffected)
3. **Manual testing** (ask the user to verify):
   - Engine launches and shows the game window
   - Mouse input works (clicking, dragging)
   - Keyboard input works (typing in text boxes, F-keys)
   - Sound plays correctly
   - Window can be resized (if implementing)
   - Fullscreen toggle works (if implementing)

## Non-Goals (Out of Scope)

- **Don't rewrite the renderer.** The engine does all rendering via manual pixel loops into a `uint16*` buffer. This is intentional and matches the original 1999 engine. A GPU-accelerated renderer would be a separate project.
- **Don't change the 16-bit 565 pixel format.** The game's sprite assets (S16, C16, BLK files) are all 16-bit 565. The engine must remain 16-bit internally.
- **Don't add SDL2 gamepad/joystick support.** The original engine only supports mouse and keyboard.
- **Linux/Windows porting** is a follow-up task, not part of this migration.

## Dependencies

Install SDL2 and SDL2_mixer (if not already present):
```bash
# macOS (Homebrew)
brew install sdl2 sdl2_mixer

# SDL 1.2 can be uninstalled after migration:
# brew uninstall sdl12-compat  (or whatever package provides SDL 1.2)
```

## Key Insight

The total SDL API surface is tiny — about 15 distinct SDL calls across the entire 200+ source file engine. 95% of the display code is raw pointer arithmetic on pixel buffers. This migration is essentially a find-and-replace with a small rewrite of `DisplayEngine::Start()` and `DrawToFrontBuffer()`.
