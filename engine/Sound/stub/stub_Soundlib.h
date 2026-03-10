#ifndef STUB_SOUNDLIB_H
#define STUB_SOUNDLIB_H

// SDL2_mixer-based SoundManager implementation for macOS/POSIX
// Replaces the original DirectSound-based implementation
//
// NOTE: We do NOT include SDL2 headers here to avoid conflicts
// with the SDL 1.2 headers used elsewhere in the engine.
// SDL2_mixer types are hidden behind void* in the header.

#include "../../PersistentObject.h"
#include <map>
#include <string>
#include <vector>

#define MAX_ACTIVE_SOUNDS 32

typedef enum {
  NO_SOUND_ERROR = 0,
  SOUNDCACHE_UNINITIALIESED,
  SOUNDCACHE_TOO_SMALL,
  SOUND_NOT_FOUND,
  SOUND_HANDLE_UNDEFINED,
  SOUND_CHANNELS_FULL,
  SOUND_MIXER_SUSPENDED,
  SOUND_MIXER_CANT_OPEN
} SOUNDERROR;

typedef int SOUNDHANDLE;

// Volumes range from -5000 (silence) to 0 (full volume)
const int SoundMinVolume = -5000;

// SoundManager - front end class for all sound routines
//
// The Sound Manager is a means of manipulating a sound cache.
// The user can call sounds to be played, leaving the
// manager to update the cache by cleaning out the oldest
// unused sounds.
//
// Sounds can be of two types - effects, or controlled sounds
//
// Controlled sounds can be looped or played  once only, and
// can be adjusted (panning, volume) while playing.  They
// may also be stopped at any point.
//
// Effects play once only, and cannot be adjusted once started.
// Additionally, effects may be delayed by a number of ticks.
// Delayed sounds are placed on a queue maintained by the manager.

class SoundManager : public PersistentObject {
  CREATURES_DECLARE_SERIAL(SoundManager)
public:
  //////////////////////////////////////////////////////////////////////////
  // Exceptions
  //////////////////////////////////////////////////////////////////////////
  class SoundException : public BasicException {
  public:
    SoundException(std::string what, uint16 line)
        : BasicException(what.c_str()), lineNumber(line) {
      ;
    }

    uint16 LineNumber() { return lineNumber; }

  private:
    uint16 lineNumber;
  };

  enum SIDText {
    sidFileNotFound = 0,
    sidNotAllFilesCouldBeMunged,
    sidUnknown,
    sidResourcesAlreadyInUse,
    sidWaveFormatNotSupported,
    sidInvalidParameter,
    sidNoAggregation,
    sidNotEnoughMemory,
    sidFailedToCreateDirectSoundObject,
    sidFailedToSetCooperativeLevel,
    sidPrimaryBufferNotCreated,
    sidPrimaryBufferCouldNotBeSetToNewFormat,
  };

  // functions
public:
  SoundManager();
  ~SoundManager();

  void StopAllSounds();
  void Update(); // Called by on timer

  BOOL SoundEnabled(); //  Is mixer running?

  SOUNDERROR InitializeCache(int size); //	Set size (K) of cache in bytes
                                        //  Flushes the existing cache

  SOUNDERROR FlushCache(); //  Clears all stored sounds from
                           //  The sound cache

  SOUNDERROR SetVolume(long volume); //  Sets the overall sound volume

  SOUNDERROR FadeOut(); //  Begin to fade all sounds (but
                        //  leaves them "playing silently"

  SOUNDERROR FadeIn(); //  Fade all sounds back in

  SOUNDERROR SuspendMixer(); //  Stop the mixer playing
                             //  (Use on KillFocus)

  SOUNDERROR RestoreMixer(); //  Restart the mixer
                             //  After it has been suspended

  SOUNDERROR PreLoadSound(DWORD wave); //  Ensures a sound is loaded into the
                                       //  cache

  SOUNDERROR PlaySoundEffect(DWORD wave, int ticks = 0, long volume = 0,
                             long pan = 0);
  //  Load and Play sound immediately or
  //  preload sound and queue it to be played
  //  after 'ticks' has elapsed

  SOUNDERROR StartControlledSound(DWORD wave, SOUNDHANDLE &handle,
                                  long volume = 0, long pan = 0,
                                  BOOL looped = FALSE);
  //  Begins a controlled sound and returns its handle

  SOUNDERROR UpdateControlledSound(SOUNDHANDLE handle, long volume, long pan);

  SOUNDERROR StopControlledSound(SOUNDHANDLE handle, BOOL fade = FALSE);
  //  Stops the specified sound (handle is
  //  then no longer valid) Sound can be
  //  optionally faded out

  BOOL FinishedControlledSound(SOUNDHANDLE handle);
  //  Has the selected sound finished playing?

  bool PlayMidiFile(std::string &fileName);

  void StopMidiPlayer();

  void SetVolumeOnMidiPlayer(int32 volume);

  void MuteMidiPlayer(bool mute);

  void SetMNGFile(std::string &mng);

  bool IsMixerFaded();

private:
  // Convert DirectSound volume (-5000..0) to SDL_mixer volume (0..128)
  static int DSVolumeToSDL(long dsVolume);

  // Convert DirectSound pan (-10000..10000) to SDL L/R panning (uint8 each)
  static void DSPanToSDL(long dsPan, uint8 &left, uint8 &right);

  // Load a WAV file for the given wave ID, using cache
  // Returns opaque Mix_Chunk* (as void*)
  void *LoadWavForID(DWORD wave);

  virtual bool Write(CreaturesArchive &archive) const;
  virtual bool Read(CreaturesArchive &archive);

  // SDL_mixer state
  bool sound_initialised;
  bool owns_audio; // True if this instance called Mix_OpenAudio
  bool mixer_suspended;
  bool faded;

  // Volume state (in DirectSound range: -5000..0)
  long overall_volume; // User-set volume
  long target_volume;  // Volume being faded towards
  long current_volume; // Currently applied volume offset

  // Channel tracking
  struct ActiveSound {
    DWORD waveID;   // 0 = slot free
    bool locked;    // Controlled sound (don't auto-free)
    long volume;    // Per-sound volume (DS range)
    long fade_rate; // Amount added to volume per tick (negative = fade out)
    void *chunk;    // Opaque Mix_Chunk* (owned by cache, not freed here)

    ActiveSound()
        : waveID(0), locked(false), volume(0), fade_rate(0), chunk(NULL) {}
  };

  ActiveSound active_sounds[MAX_ACTIVE_SOUNDS];
  int sounds_playing;
  DWORD sound_index;

  // Sound cache: wave ID -> opaque Mix_Chunk*
  std::map<DWORD, void *> sound_cache;

  // Sound queue for delayed playback
  struct SoundQueueItem {
    DWORD wave;
    int ticks;
    long volume;
    long pan;
  };
  std::vector<SoundQueueItem> sound_queue;

  // MNG file name (for future music support)
  std::string mungeFile;
};

#endif
