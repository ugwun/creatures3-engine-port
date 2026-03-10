#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "stub_Soundlib.h"
#include "../../../common/C2eTypes.h"
#include "../../App.h"
#include "../../Display/ErrorMessageHandler.h"
#include "../../FlightRecorder.h"
#include "../../General.h"
#include "../MidiModule.h"

// SDL2_mixer — included only in this .cpp to avoid SDL1/SDL2 header conflicts
#include <SDL_mixer.h>

#include <cmath>

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

CREATURES_IMPLEMENT_SERIAL(SoundManager)

// ---------------------------------------------------------------------------
// Volume / Pan conversion utilities
// ---------------------------------------------------------------------------

// DirectSound volume: -5000 (silence) to 0 (full)
// SDL_mixer volume: 0 to MIX_MAX_VOLUME (128)
int SoundManager::DSVolumeToSDL(long dsVolume) {
  if (dsVolume <= SoundMinVolume)
    return 0;
  if (dsVolume >= 0)
    return MIX_MAX_VOLUME;
  // Linear scale: -5000 -> 0,  0 -> 128
  return (int)((dsVolume + 5000) / 5000.0f * MIX_MAX_VOLUME);
}

// DirectSound pan: -10000 (full left) to 0 (center) to +10000 (full right)
// SDL_mixer panning: left=0..255, right=0..255
void SoundManager::DSPanToSDL(long dsPan, uint8 &left, uint8 &right) {
  // Clamp
  if (dsPan < -10000)
    dsPan = -10000;
  if (dsPan > 10000)
    dsPan = 10000;

  // Normalize to 0.0 (full left) .. 1.0 (full right)
  float norm = (dsPan + 10000) / 20000.0f;

  // At center (norm=0.5): left=255, right=255 (no attenuation)
  // At full left (norm=0): left=255, right=0
  // At full right (norm=1): left=0, right=255
  right = (uint8)(norm * 255);
  left = (uint8)((1.0f - norm) * 255);
}

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

void SoundManager::SetMNGFile(std::string &mng) {
  if (mungeFile == mng)
    return;
  mungeFile = mng;
  // Don't flush the WAV cache — MNG is separate
}

SoundManager::SoundManager()
    : sound_initialised(false), owns_audio(false), mixer_suspended(false),
      faded(false), overall_volume(0), target_volume(0), current_volume(0),
      sounds_playing(0), sound_index(1) {

  mungeFile = "Music.mng";

  // Check if audio is already open (another SoundManager instance may have
  // opened it).  Mix_QuerySpec returns non-zero if audio is open.
  int freq = 0;
  Uint16 fmt = 0;
  int chans = 0;
  if (Mix_QuerySpec(&freq, &fmt, &chans)) {
    // Audio already open — just allocate channels for this instance.
    theFlightRecorder.Log(
        4, "SoundManager: audio already open (%d Hz), reusing\n", freq);
  } else {
    if (Mix_OpenAudio(22050, MIX_DEFAULT_FORMAT, 2, 1024) < 0) {
      theFlightRecorder.Log(4, "SoundManager: Mix_OpenAudio failed: %s\n",
                            Mix_GetError());
      return;
    }
    owns_audio = true;
  }

  // Allocate enough mixing channels
  Mix_AllocateChannels(MAX_ACTIVE_SOUNDS);

  sound_initialised = true;

  theFlightRecorder.Log(
      4, "SoundManager: initialized (SDL2_mixer, %d channels%s)\n",
      MAX_ACTIVE_SOUNDS, owns_audio ? "" : ", shared audio device");
}

SoundManager::~SoundManager() {
  if (!sound_initialised)
    return;

  StopAllSounds();
  FlushCache();

  // Only close the audio device if this instance opened it.
  if (owns_audio) {
    Mix_CloseAudio();
  }
  sound_initialised = false;
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

SOUNDERROR SoundManager::InitializeCache(int size) {
  (void)size; // SDL_mixer manages its own memory
  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::FlushCache() {
  // Free all cached chunks
  for (std::map<DWORD, void *>::iterator it = sound_cache.begin();
       it != sound_cache.end(); ++it) {
    if (it->second) {
      Mix_FreeChunk((Mix_Chunk *)it->second);
    }
  }
  sound_cache.clear();
  return NO_SOUND_ERROR;
}

// Helper: load a WAV file for the given wave ID, using cache
void *SoundManager::LoadWavForID(DWORD wave) {
  // Check cache first
  std::map<DWORD, void *>::iterator it = sound_cache.find(wave);
  if (it != sound_cache.end()) {
    return it->second;
  }

  // MNG sounds not supported yet
  if (wave >= 0xff000000) {
    return NULL;
  }

  // Build the file path using the engine's BuildFsp
  std::string path(BuildFsp(wave, "wav", SOUNDS_DIR));

  Mix_Chunk *chunk = Mix_LoadWAV(path.c_str());
  if (!chunk) {
    // Don't spam the log — just return NULL
    return NULL;
  }

  // Cache it
  sound_cache[wave] = (void *)chunk;
  return (void *)chunk;
}

// ---------------------------------------------------------------------------
// Sound playback
// ---------------------------------------------------------------------------

SOUNDERROR SoundManager::PreLoadSound(DWORD wave) {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  void *chunk = LoadWavForID(wave);
  if (!chunk)
    return SOUND_NOT_FOUND;

  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::PlaySoundEffect(DWORD wave, int ticks, long volume,
                                         long pan) {
  if (mixer_suspended || !sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  // Queue for later if ticks > 0
  if (ticks > 0) {
    SOUNDERROR err = PreLoadSound(wave);
    if (err == NO_SOUND_ERROR) {
      SoundQueueItem item;
      item.wave = wave;
      item.ticks = ticks;
      item.volume = volume;
      item.pan = pan;
      sound_queue.push_back(item);
    }
    return err;
  }

  // Play immediately
  Mix_Chunk *chunk = (Mix_Chunk *)LoadWavForID(wave);
  if (!chunk)
    return SOUND_NOT_FOUND;

  // Find a free channel slot in our tracking array
  int slot = -1;
  for (int i = 0; i < MAX_ACTIVE_SOUNDS; i++) {
    if (active_sounds[i].waveID == 0) {
      slot = i;
      break;
    }
  }
  if (slot < 0)
    return SOUND_CHANNELS_FULL;

  // Calculate effective volume (sound volume + manager volume)
  long effectiveVol = volume + current_volume;
  if (effectiveVol < SoundMinVolume)
    effectiveVol = SoundMinVolume;

  int sdlVol = DSVolumeToSDL(effectiveVol);

  // Play on the corresponding SDL_mixer channel
  Mix_Volume(slot, sdlVol);

  // Set panning
  uint8 panL, panR;
  DSPanToSDL(pan, panL, panR);
  Mix_SetPanning(slot, panL, panR);

  int result = Mix_PlayChannel(slot, chunk, 0);
  if (result < 0) {
    return SOUND_CHANNELS_FULL;
  }

  // Track it
  active_sounds[slot].waveID = ++sound_index;
  active_sounds[slot].locked = false;
  active_sounds[slot].volume = volume;
  active_sounds[slot].fade_rate = 0;
  active_sounds[slot].chunk = (void *)chunk;
  sounds_playing++;

  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::StartControlledSound(DWORD wave, SOUNDHANDLE &handle,
                                              long volume, long pan,
                                              BOOL looped) {
  if (mixer_suspended || !sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  Mix_Chunk *chunk = (Mix_Chunk *)LoadWavForID(wave);
  if (!chunk)
    return SOUND_NOT_FOUND;

  // Find a free slot
  int slot = -1;
  for (int i = 0; i < MAX_ACTIVE_SOUNDS; i++) {
    if (active_sounds[i].waveID == 0) {
      slot = i;
      break;
    }
  }
  if (slot < 0)
    return SOUND_CHANNELS_FULL;

  // Calculate effective volume
  long effectiveVol = volume + current_volume;
  if (effectiveVol < SoundMinVolume)
    effectiveVol = SoundMinVolume;

  int sdlVol = DSVolumeToSDL(effectiveVol);
  Mix_Volume(slot, sdlVol);

  // Set panning
  uint8 panL, panR;
  DSPanToSDL(pan, panL, panR);
  Mix_SetPanning(slot, panL, panR);

  // Play: -1 loops means infinite, 0 means play once
  int loops = looped ? -1 : 0;
  int result = Mix_PlayChannel(slot, chunk, loops);
  if (result < 0)
    return SOUND_CHANNELS_FULL;

  // Track
  active_sounds[slot].waveID = ++sound_index;
  active_sounds[slot].locked = true; // Controlled sounds are locked
  active_sounds[slot].volume = volume;
  active_sounds[slot].fade_rate = 0;
  active_sounds[slot].chunk = (void *)chunk;
  sounds_playing++;

  handle = slot; // Return the channel as the handle
  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::UpdateControlledSound(SOUNDHANDLE handle, long volume,
                                               long pan) {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  if (handle < 0 || handle >= MAX_ACTIVE_SOUNDS)
    return SOUND_HANDLE_UNDEFINED;

  if (active_sounds[handle].waveID == 0)
    return SOUND_HANDLE_UNDEFINED;

  // Update stored volume
  active_sounds[handle].volume = volume;

  // Calculate effective volume
  long effectiveVol = volume + current_volume;
  if (effectiveVol < SoundMinVolume)
    effectiveVol = SoundMinVolume;

  Mix_Volume(handle, DSVolumeToSDL(effectiveVol));

  // Update panning
  uint8 panL, panR;
  DSPanToSDL(pan, panL, panR);
  Mix_SetPanning(handle, panL, panR);

  return NO_SOUND_ERROR;
}

BOOL SoundManager::FinishedControlledSound(SOUNDHANDLE handle) {
  if (!sound_initialised)
    return TRUE;

  if (handle < 0 || handle >= MAX_ACTIVE_SOUNDS)
    return TRUE;

  if (active_sounds[handle].waveID == 0)
    return TRUE;

  return Mix_Playing(handle) ? FALSE : TRUE;
}

SOUNDERROR SoundManager::StopControlledSound(SOUNDHANDLE handle, BOOL fade) {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  if (handle < 0 || handle >= MAX_ACTIVE_SOUNDS)
    return SOUND_HANDLE_UNDEFINED;

  if (active_sounds[handle].waveID == 0)
    return SOUND_HANDLE_UNDEFINED;

  if (fade) {
    // Start a fade-out (handled in Update)
    active_sounds[handle].fade_rate = -200; // Fade rate per tick
  } else {
    Mix_HaltChannel(handle);
    active_sounds[handle].waveID = 0;
    active_sounds[handle].locked = false;
    active_sounds[handle].chunk = NULL;
    if (sounds_playing > 0)
      sounds_playing--;
  }

  return NO_SOUND_ERROR;
}

// ---------------------------------------------------------------------------
// Sound control
// ---------------------------------------------------------------------------

void SoundManager::StopAllSounds() {
  if (!sound_initialised)
    return;

  // Flush the queue
  sound_queue.clear();

  Mix_HaltChannel(-1); // Stop all channels

  for (int i = 0; i < MAX_ACTIVE_SOUNDS; i++) {
    active_sounds[i].waveID = 0;
    active_sounds[i].locked = false;
    active_sounds[i].chunk = NULL;
    active_sounds[i].fade_rate = 0;
  }
  sounds_playing = 0;
}

void SoundManager::Update() {
  const long MANAGER_FADE_RATE = 200;

  if (!sound_initialised)
    return;

  // Process the sound queue (delayed sounds)
  for (size_t i = 0; i < sound_queue.size();) {
    if (sound_queue[i].ticks <= 0) {
      PlaySoundEffect(sound_queue[i].wave, 0, sound_queue[i].volume,
                      sound_queue[i].pan);
      sound_queue.erase(sound_queue.begin() + i);
    } else {
      sound_queue[i].ticks--;
      i++;
    }
  }

  // Move current_volume towards target_volume (fade support)
  if (current_volume < target_volume) {
    current_volume += MANAGER_FADE_RATE;
    if (current_volume > target_volume)
      current_volume = target_volume;
  } else if (current_volume > target_volume) {
    current_volume -= MANAGER_FADE_RATE;
    if (current_volume < target_volume)
      current_volume = target_volume;
  }

  // Update active sounds
  for (int i = 0; i < MAX_ACTIVE_SOUNDS; i++) {
    if (active_sounds[i].waveID == 0)
      continue;

    if (!Mix_Playing(i)) {
      // Sound finished naturally
      if (!active_sounds[i].locked) {
        active_sounds[i].waveID = 0;
        active_sounds[i].chunk = NULL;
        if (sounds_playing > 0)
          sounds_playing--;
      }
      continue;
    }

    // Handle fading
    if (active_sounds[i].fade_rate != 0) {
      active_sounds[i].volume += active_sounds[i].fade_rate;

      long effectiveVol = active_sounds[i].volume + current_volume;
      if (effectiveVol <= SoundMinVolume) {
        // Faded to silence — stop it
        Mix_HaltChannel(i);
        active_sounds[i].waveID = 0;
        active_sounds[i].locked = false;
        active_sounds[i].chunk = NULL;
        active_sounds[i].fade_rate = 0;
        if (sounds_playing > 0)
          sounds_playing--;
      } else {
        Mix_Volume(i, DSVolumeToSDL(effectiveVol));
      }
    } else {
      // Just update volume in case manager volume changed
      long effectiveVol = active_sounds[i].volume + current_volume;
      if (effectiveVol < SoundMinVolume)
        effectiveVol = SoundMinVolume;
      Mix_Volume(i, DSVolumeToSDL(effectiveVol));
    }
  }
}

BOOL SoundManager::SoundEnabled() { return sound_initialised ? TRUE : FALSE; }

SOUNDERROR SoundManager::SetVolume(long volume) {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  overall_volume = volume;
  target_volume = volume;
  current_volume = volume;

  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::FadeOut() {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  target_volume = SoundMinVolume;
  faded = true;
  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::FadeIn() {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  target_volume = overall_volume;
  faded = false;
  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::SuspendMixer() {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  mixer_suspended = true;
  Mix_Pause(-1); // Pause all channels
  return NO_SOUND_ERROR;
}

SOUNDERROR SoundManager::RestoreMixer() {
  if (!sound_initialised)
    return SOUND_MIXER_SUSPENDED;

  mixer_suspended = false;
  Mix_Resume(-1); // Resume all channels
  return NO_SOUND_ERROR;
}

bool SoundManager::IsMixerFaded() { return faded; }

// ---------------------------------------------------------------------------
// MIDI (not implemented — games rarely use this path)
// ---------------------------------------------------------------------------

bool SoundManager::PlayMidiFile(std::string &fileName) { return true; }

void SoundManager::StopMidiPlayer() {}

void SoundManager::SetVolumeOnMidiPlayer(int32 volume) {}

void SoundManager::MuteMidiPlayer(bool mute) {}

// ---------------------------------------------------------------------------
// Serialization (minimal — save/load not critical for this port)
// ---------------------------------------------------------------------------

bool SoundManager::Write(CreaturesArchive &archive) const { return false; }

bool SoundManager::Read(CreaturesArchive &archive) { return false; }
